import { Readable } from "node:stream";
import { PassThrough } from "node:stream";
import { pipeline } from "node:stream/promises";

import busboy from "busboy";

import { getStorageProvider } from "../storage";
import { assertMatchesFileSignature } from "./file-signature";
import { MediaValidationError } from "./media-config";

const SIGNATURE_PEEK_BYTES = 32;

export class UploadError extends MediaValidationError {}

export type ReceivedUpload = {
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  fields: Record<string, string>;
};

/**
 * Streams a single-file multipart/form-data request straight to the
 * configured storage provider — the file is never fully buffered in
 * memory (see requirement #32/#48: no base64, no full-file buffering).
 *
 * `deriveStorageKey` is called as soon as the filename/MIME type are
 * known (before any bytes are read) so the caller can generate the
 * server-controlled key (see media-keys.ts) up front.
 *
 * Enforces `maxBytes` while streaming (aborts and cleans up the
 * partially-written file if exceeded) and validates the first bytes of
 * the file against its claimed MIME type before any of it reaches disk.
 */
export async function receiveMultipartUpload(
  request: Request,
  opts: {
    fileFieldName?: string;
    maxBytes: number;
    deriveStorageKey: (info: { filename: string; mimeType: string }) => string;
  },
): Promise<ReceivedUpload> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    throw new UploadError("Expected a multipart/form-data upload.");
  }
  if (!request.body) {
    throw new UploadError("Empty request body.");
  }

  const fileFieldName = opts.fileFieldName ?? "file";
  const storage = getStorageProvider();
  const fields: Record<string, string> = {};

  let settled = false;
  return await new Promise<ReceivedUpload>((resolvePromise, rejectPromise) => {
    function resolve(value: ReceivedUpload) {
      if (settled) return;
      settled = true;
      resolvePromise(value);
    }
    function reject(error: unknown) {
      if (settled) return;
      settled = true;
      rejectPromise(error);
    }

    const bb = busboy({
      headers: Object.fromEntries(request.headers),
      limits: { fileSize: opts.maxBytes, files: 1 },
    });

    let sawFile = false;
    let saveResultPromise: Promise<{ sizeBytes: number }> | null = null;
    let storageKey = "";
    let originalFilename = "";
    let mimeType = "";

    bb.on("field", (name, value) => {
      fields[name] = value;
    });

    bb.on("file", (name, fileStream, info) => {
      if (name !== fileFieldName) {
        fileStream.resume(); // discard anything unexpected
        return;
      }
      sawFile = true;
      originalFilename = info.filename || "upload";
      mimeType = (info.mimeType || "application/octet-stream").toLowerCase();

      try {
        storageKey = opts.deriveStorageKey({ filename: originalFilename, mimeType });
      } catch (error) {
        fileStream.resume();
        reject(error);
        return;
      }

      let headerChecked = false;
      let sawLimit = false;
      fileStream.on("limit", () => {
        sawLimit = true;
      });

      // Validate the first chunk's magic bytes before any of it is
      // written to disk — the rest of the stream passes through
      // untouched. This never buffers more than SIGNATURE_PEEK_BYTES.
      const validating = new PassThrough();
      validating.on("error", () => {
        /* surfaced via the pipeline promise below */
      });
      fileStream.on("data", function firstChunkCheck(this: Readable, chunk: Buffer) {
        if (!headerChecked) {
          headerChecked = true;
          try {
            assertMatchesFileSignature(chunk.subarray(0, SIGNATURE_PEEK_BYTES), mimeType);
          } catch (error) {
            fileStream.off("data", firstChunkCheck);
            validating.destroy(error as Error);
            return;
          }
        }
      });

      saveResultPromise = storage
        .save(storageKey, fileStream.pipe(validating))
        .then((meta) => {
          if (sawLimit) {
            throw new UploadError(
              `File is too large. Maximum for this upload is ${(opts.maxBytes / (1024 * 1024)).toFixed(0)} MB.`,
            );
          }
          return meta;
        })
        .catch(async (error) => {
          await storage.delete(storageKey).catch(() => undefined);
          throw error;
        });
    });

    bb.on("error", (error) => reject(error));

    bb.on("close", () => {
      if (!sawFile) {
        reject(new UploadError("No file was uploaded."));
        return;
      }
      (saveResultPromise ?? Promise.reject(new UploadError("Upload failed.")))
        .then((meta) =>
          resolve({
            storageKey,
            originalFilename,
            mimeType,
            sizeBytes: meta.sizeBytes,
            fields,
          }),
        )
        .catch(reject);
    });

    pipeline(Readable.fromWeb(request.body as never), bb).catch(reject);
  });
}
