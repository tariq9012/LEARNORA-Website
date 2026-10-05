import { MediaValidationError } from "./media-config";

/** Unknown intent id, or one that belongs to someone else (deliberately indistinguishable → 404). */
export class UploadNotFoundError extends Error {
  constructor() {
    super("Upload not found.");
  }
}

/** The request is understood but can't be honoured (expired, wrong size, not uploaded yet…) → 400. */
export class UploadIntentError extends MediaValidationError {}
