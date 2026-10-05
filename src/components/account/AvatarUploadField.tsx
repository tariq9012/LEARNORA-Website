import { useRef, useState } from "react";
import { Loader2, Trash2, Upload } from "lucide-react";

import { Avatar, Button } from "@/components/ui/kit";
import { CSRF_HEADER_NAME, getCsrfToken } from "@/lib/csrf";
import { UploadFailedError, uploadMedia, type UploadPhase } from "@/lib/direct-upload";

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? `Upload failed (${response.status}).`;
  } catch {
    return `Upload failed (${response.status}).`;
  }
}

/**
 * Avatar upload/remove control shared by the student and instructor
 * profile pages. Hits /api/account/avatar (POST to replace, DELETE to
 * clear). Uploads use the shared Phase 18 client (src/lib/direct-upload.ts):
 * browser → R2 directly when storage is R2, existing FormData route when
 * local. Rendered as a circular preview instead of a file row.
 */
export function AvatarUploadField({
  avatarUrl,
  initials,
  onChange,
}: {
  avatarUrl: string | null;
  initials: string;
  onChange: (avatarUrl: string | null) => void;
}) {
  const [phase, setPhase] = useState<UploadPhase | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = phase !== null || removing;

  async function handleFileChosen(file: File) {
    if (phase !== null) return;
    setPhase("preparing");
    setProgress(null);
    setError("");
    try {
      // Phase 18: direct-to-R2 when storage is R2; server-mediated when local (see direct-upload.ts).
      const asset = await uploadMedia<{ url: string }>({
        file,
        purpose: "AVATAR",
        legacy: { url: "/api/account/avatar" },
        onPhase: (p) => {
          setPhase(p);
          if (p !== "uploading") setProgress(null);
        },
        onProgress: setProgress,
      });
      onChange(asset.url);
    } catch (e) {
      setError(e instanceof UploadFailedError ? e.message : "Upload failed. Please try again.");
    } finally {
      setPhase(null);
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleRemove() {
    setRemoving(true);
    setError("");
    try {
      const response = await fetch("/api/account/avatar", {
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
    <div className="flex items-center gap-4">
      <Avatar initials={initials} src={avatarUrl} size="xl" />
      <div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {phase === "uploading" && progress !== null
              ? `Uploading ${Math.round(progress * 100)}%`
              : phase === "preparing"
                ? "Preparing…"
                : phase === "finalizing"
                  ? "Finalizing…"
                  : phase === "uploading"
                    ? "Uploading…"
                    : avatarUrl
                      ? "Replace photo"
                      : "Upload photo"}
          </Button>
          {avatarUrl && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRemove}
              disabled={busy}
            >
              <Trash2 size={14} />
              Remove
            </Button>
          )}
        </div>
        <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
          JPG, PNG or WebP, up to 3 MB
        </p>
        {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFileChosen(file);
          }}
        />
      </div>
    </div>
  );
}
