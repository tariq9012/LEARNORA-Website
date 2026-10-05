import { useRef, useState } from "react";
import { File as FileIcon, Loader2, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/kit";
import { getCsrfToken, CSRF_HEADER_NAME } from "@/lib/csrf";
import {
  UploadFailedError,
  uploadMedia,
  type UploadPhase,
  type UploadPurpose,
} from "@/lib/direct-upload";
import { cn } from "@/lib/utils";
import type { AssetDTO } from "@/server/dto/media";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? `Upload failed (${response.status}).`;
  } catch {
    return `Upload failed (${response.status}).`;
  }
}

/**
 * A single upload control: shows the current asset (if any), a file
 * picker, upload status, and a Remove button.
 *
 * Phase 18: with R2 storage the file goes straight from the browser to R2
 * (intent → PUT → finalize, see src/lib/direct-upload.ts) and the percentage is
 * the real byte progress of that PUT. With local storage the server answers
 * "mode: server" and the existing multipart route at `uploadUrl` is used (no
 * reliable progress there, so the bar stays indeterminate). "Upload complete"
 * is only ever shown after the server has verified and attached the file.
 *
 * `removeUrl` is the existing instructor media DELETE route (unchanged).
 */
const PHASE_LABEL: Record<UploadPhase, string> = {
  preparing: "Preparing upload…",
  uploading: "Uploading…",
  finalizing: "Finalizing…",
};

export function MediaUploadField({
  label,
  accept,
  purpose,
  courseId,
  lessonId,
  uploadUrl,
  removeUrl,
  current,
  onChange,
  extraFields,
  disabled,
}: {
  label: string;
  accept: string;
  purpose: UploadPurpose;
  courseId?: string;
  lessonId?: string;
  /** Legacy multipart route — only used when storage is local (development). */
  uploadUrl: string;
  removeUrl: string;
  current: AssetDTO | null;
  onChange: (asset: AssetDTO | null) => void;
  extraFields?: Record<string, string>;
  disabled?: boolean;
}) {
  const [phase, setPhase] = useState<UploadPhase | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState("");
  const [failedFile, setFailedFile] = useState<File | null>(null);
  const [justUploaded, setJustUploaded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const busy = phase !== null || removing;

  async function handleFileChosen(file: File) {
    if (phase !== null) return; // never start a second upload while one is running
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase("preparing");
    setProgress(null);
    setError("");
    setFailedFile(null);
    setJustUploaded(false);
    try {
      const asset = await uploadMedia<AssetDTO>({
        file,
        purpose,
        ...(courseId && { courseId }),
        ...(lessonId && { lessonId }),
        legacy: { url: uploadUrl, ...(extraFields && { fields: extraFields }) },
        onPhase: (p) => {
          setPhase(p);
          if (p !== "uploading") setProgress(null);
        },
        onProgress: setProgress,
        signal: controller.signal,
      });
      onChange(asset);
      setJustUploaded(true);
    } catch (e) {
      setError(e instanceof UploadFailedError ? e.message : "Upload failed. Please try again.");
      setFailedFile(file);
    } finally {
      abortRef.current = null;
      setPhase(null);
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleRemove() {
    setRemoving(true);
    setError("");
    setJustUploaded(false);
    setFailedFile(null);
    try {
      const response = await fetch(removeUrl, {
        method: "DELETE",
        headers: { [CSRF_HEADER_NAME]: getCsrfToken() },
      });
      if (!response.ok) {
        setError(await parseErrorMessage(response));
        return;
      }
      onChange(null);
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div>
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
        {label}
      </p>
      <div
        className={cn(
          "flex items-center justify-between gap-3 rounded-lg border border-dashed border-line p-3",
          current && "border-solid",
        )}
      >
        <div className="flex min-w-0 items-center gap-2 text-sm">
          {current ? (
            <>
              <FileIcon size={16} className="shrink-0 text-brand-soft" />
              <span className="truncate">{current.originalFilename}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatBytes(current.sizeBytes)}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">No file uploaded yet.</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {current && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRemove}
              disabled={busy || disabled}
            >
              <Trash2 size={14} />
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || disabled}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {phase === "uploading" && progress !== null
              ? `Uploading ${Math.round(progress * 100)}%`
              : phase
                ? PHASE_LABEL[phase]
                : current
                  ? "Replace"
                  : "Upload"}
          </Button>
          {phase !== null && phase !== "finalizing" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => abortRef.current?.abort()}
            >
              Cancel
            </Button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          disabled={busy || disabled}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFileChosen(file);
          }}
        />
      </div>
      {phase === "uploading" && (
        <div
          className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-panel-2"
          role="progressbar"
          aria-label="Upload progress"
          aria-valuemin={0}
          aria-valuemax={100}
          {...(progress !== null && { "aria-valuenow": Math.round(progress * 100) })}
        >
          <div
            className={cn(
              "h-full bg-brand-soft transition-[width]",
              progress === null && "w-1/3 animate-pulse",
            )}
            style={progress !== null ? { width: `${Math.round(progress * 100)}%` } : undefined}
          />
        </div>
      )}
      {justUploaded && !error && phase === null && (
        <p className="mt-1.5 text-xs text-muted-foreground">Upload complete.</p>
      )}
      {error && (
        <p className="mt-1.5 text-xs text-destructive">
          {error}{" "}
          {failedFile && !busy && (
            <button
              type="button"
              className="underline underline-offset-2"
              onClick={() => void handleFileChosen(failedFile)}
            >
              Retry
            </button>
          )}
        </p>
      )}
    </div>
  );
}
