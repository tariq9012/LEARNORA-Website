import { useRef, useState } from "react";
import { File as FileIcon, Loader2, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/kit";
import { getCsrfToken, CSRF_HEADER_NAME } from "@/lib/csrf";
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
 * picker, an indeterminate "Uploading…" state (never a fabricated
 * percentage — see Phase 7 report), and a Remove button.
 *
 * `uploadUrl`/`removeUrl` are the instructor media API routes; this
 * component doesn't know or care about course/lesson ids beyond that.
 */
export function MediaUploadField({
  label,
  accept,
  uploadUrl,
  removeUrl,
  current,
  onChange,
  extraFields,
  disabled,
}: {
  label: string;
  accept: string;
  uploadUrl: string;
  removeUrl: string;
  current: AssetDTO | null;
  onChange: (asset: AssetDTO | null) => void;
  extraFields?: Record<string, string>;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFileChosen(file: File) {
    setBusy(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      for (const [key, value] of Object.entries(extraFields ?? {})) {
        formData.append(key, value);
      }
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { [CSRF_HEADER_NAME]: getCsrfToken() },
        body: formData,
      });
      if (!response.ok) {
        setError(await parseErrorMessage(response));
        return;
      }
      const asset = (await response.json()) as AssetDTO;
      onChange(asset);
    } catch {
      setError("Upload failed. Check your connection and try again.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleRemove() {
    setBusy(true);
    setError("");
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
      setBusy(false);
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
            {busy ? "Uploading…" : current ? "Replace" : "Upload"}
          </Button>
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
      {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
    </div>
  );
}
