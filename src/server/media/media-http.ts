import { ForbiddenError, UnauthorizedError } from "../auth/guards";
import { CsrfError } from "../auth/csrf";
import { MediaValidationError } from "./media-config";
import { FileSignatureError } from "./file-signature";
import { UploadError } from "./upload-handler";
import { MediaOwnershipError, MediaStateError } from "./media-service";
import { UploadIntentError, UploadNotFoundError } from "./direct-upload-errors";

/** Maps a thrown error from a media route handler to the right HTTP status + message. */
export function mediaErrorResponse(error: unknown): Response {
  if (error instanceof UnauthorizedError) {
    return Response.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof ForbiddenError || error instanceof CsrfError) {
    return Response.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof MediaOwnershipError || error instanceof UploadNotFoundError) {
    return Response.json({ error: error.message }, { status: 404 });
  }
  if (
    error instanceof MediaStateError ||
    error instanceof UploadIntentError ||
    error instanceof MediaValidationError ||
    error instanceof FileSignatureError ||
    error instanceof UploadError
  ) {
    return Response.json({ error: error.message }, { status: 400 });
  }
  console.error("[media] unexpected error", error);
  return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}

/** Reads a small JSON request body (intent/finalize metadata — never file bytes). */
export async function readSmallJsonBody(request: Request, maxBytes = 8 * 1024): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new UploadIntentError("Expected a JSON request.");
  }
  const text = await request.text();
  if (text.length > maxBytes) throw new UploadIntentError("Request is too large.");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new UploadIntentError("Invalid JSON.");
  }
}
