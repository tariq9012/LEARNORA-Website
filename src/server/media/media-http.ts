import { ForbiddenError, UnauthorizedError } from "../auth/guards";
import { CsrfError } from "../auth/csrf";
import { MediaValidationError } from "./media-config";
import { FileSignatureError } from "./file-signature";
import { UploadError } from "./upload-handler";
import { MediaOwnershipError, MediaStateError } from "./media-service";

/** Maps a thrown error from a media route handler to the right HTTP status + message. */
export function mediaErrorResponse(error: unknown): Response {
  if (error instanceof UnauthorizedError) {
    return Response.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof ForbiddenError || error instanceof CsrfError) {
    return Response.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof MediaOwnershipError) {
    return Response.json({ error: error.message }, { status: 404 });
  }
  if (
    error instanceof MediaStateError ||
    error instanceof MediaValidationError ||
    error instanceof FileSignatureError ||
    error instanceof UploadError
  ) {
    return Response.json({ error: error.message }, { status: 400 });
  }
  console.error("[media] unexpected error", error);
  return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}
