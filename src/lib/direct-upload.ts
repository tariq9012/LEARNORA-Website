import { CSRF_HEADER_NAME, getCsrfToken } from "@/lib/csrf";
import {
  MediaValidationError,
  assertAllowedType,
  assertWithinSizeLimit,
  type MediaPurpose,
} from "@/server/media/media-config";

/**
 * Phase 18 browser upload client.
 *
 *   1. POST /api/media/upload-intent   metadata only (no file bytes)
 *   2. PUT  <presigned R2 url>         the file, straight to R2 (XHR for real progress)
 *   3. POST /api/media/upload-finalize intent id only; "complete" is shown only after this succeeds
 *
 * If the server answers { mode: "server" } (STORAGE_PROVIDER=local, i.e. local
 * development) the file is sent through the existing multipart route instead.
 *
 * Nothing secret ever reaches this file: the presigned URL is the only credential
 * and it authorizes one PUT to one key for a few minutes.
 */

export type UploadPurpose = MediaPurpose;
export type UploadPhase = "preparing" | "uploading" | "finalizing";

export class UploadFailedError extends Error {}

export type UploadRequest = {
  file: File;
  purpose: UploadPurpose;
  courseId?: string;
  lessonId?: string;
  /** Resource title (lesson resources only). */
  title?: string;
  /** Existing multipart endpoint, used ONLY when the server reports mode "server". */
  legacy: { url: string; fields?: Record<string, string> };
  onPhase?: (phase: UploadPhase) => void;
  /** 0..1, real bytes sent to R2. Not called for the server-mediated fallback (no reliable progress). */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
};

type IntentResponse =
  | { mode: "server" }
  | {
      mode: "direct";
      intentId: string;
      upload: { method: "PUT"; url: string; headers: Record<string, string>; expiresAt: string };
    };

async function errorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? `${fallback} (${response.status}).`;
  } catch {
    return `${fallback} (${response.status}).`;
  }
}

async function postJson(url: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", [CSRF_HEADER_NAME]: getCsrfToken() },
    body: JSON.stringify(body),
    ...(signal && { signal }),
  });
}

function putToR2(
  upload: { url: string; headers: Record<string, string> },
  file: File,
  onProgress: ((fraction: number) => void) | undefined,
  signal: AbortSignal | undefined,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", upload.url);
    for (const [name, value] of Object.entries(upload.headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        resolve();
      } else if (xhr.status === 403) {
        reject(
          new UploadFailedError("The upload permission expired or was rejected. Please try again."),
        );
      } else {
        reject(
          new UploadFailedError(`Storage rejected the upload (${xhr.status}). Please try again.`),
        );
      }
    };
    xhr.onerror = () =>
      reject(new UploadFailedError("Upload failed. Check your connection and try again."));
    xhr.onabort = () => reject(new UploadFailedError("Upload canceled."));

    if (signal) {
      if (signal.aborted) {
        reject(new UploadFailedError("Upload canceled."));
        return;
      }
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }
    // The body is the File itself: the browser streams it, nothing is read into memory here.
    xhr.send(file);
  });
}

export async function uploadMedia<T>(request: UploadRequest): Promise<T> {
  const { file, purpose, onPhase, onProgress, signal } = request;

  // UX-only pre-check; the server re-validates everything and is authoritative.
  try {
    assertAllowedType(purpose, file.type, file.name);
    assertWithinSizeLimit(purpose, file.size);
  } catch (error) {
    if (error instanceof MediaValidationError) throw new UploadFailedError(error.message);
    throw error;
  }

  onPhase?.("preparing");
  let intentResponse: Response;
  try {
    intentResponse = await postJson(
      "/api/media/upload-intent",
      {
        purpose,
        ...(request.courseId && { courseId: request.courseId }),
        ...(request.lessonId && { lessonId: request.lessonId }),
        filename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        ...(request.title && { title: request.title }),
      },
      signal,
    );
  } catch {
    throw new UploadFailedError(
      signal?.aborted ? "Upload canceled." : "Upload failed. Check your connection and try again.",
    );
  }
  if (!intentResponse.ok) {
    throw new UploadFailedError(await errorMessage(intentResponse, "Could not start the upload"));
  }
  const intent = (await intentResponse.json()) as IntentResponse;

  // Local development: keep the existing server-mediated multipart upload.
  if (intent.mode === "server") {
    onPhase?.("uploading");
    const formData = new FormData();
    formData.append("file", file);
    for (const [key, value] of Object.entries(request.legacy.fields ?? {})) {
      formData.append(key, value);
    }
    let legacyResponse: Response;
    try {
      legacyResponse = await fetch(request.legacy.url, {
        method: "POST",
        headers: { [CSRF_HEADER_NAME]: getCsrfToken() },
        body: formData,
        ...(signal && { signal }),
      });
    } catch {
      throw new UploadFailedError(
        signal?.aborted
          ? "Upload canceled."
          : "Upload failed. Check your connection and try again.",
      );
    }
    if (!legacyResponse.ok)
      throw new UploadFailedError(await errorMessage(legacyResponse, "Upload failed"));
    return (await legacyResponse.json()) as T;
  }

  // R2: the file goes straight to the bucket.
  onPhase?.("uploading");
  onProgress?.(0);
  await putToR2(intent.upload, file, onProgress, signal);

  // Only after R2 has the object do we ask the server to verify and attach it.
  // Finalize is idempotent on the server, so transient network/5xx failures are
  // retried here instead of making the user re-upload a large file.
  onPhase?.("finalizing");
  let lastNetworkError = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 800 * attempt));
    try {
      const finalizeResponse = await postJson("/api/media/upload-finalize", {
        intentId: intent.intentId,
      });
      if (finalizeResponse.ok) return (await finalizeResponse.json()) as T;
      if (finalizeResponse.status < 500) {
        throw new UploadFailedError(
          await errorMessage(finalizeResponse, "Could not finish the upload"),
        );
      }
      lastNetworkError = false;
    } catch (error) {
      if (error instanceof UploadFailedError) throw error;
      lastNetworkError = true;
    }
  }
  throw new UploadFailedError(
    lastNetworkError
      ? "The file reached storage but we couldn't confirm it. Please try again."
      : "The server couldn't finish the upload. Please try again.",
  );
}
