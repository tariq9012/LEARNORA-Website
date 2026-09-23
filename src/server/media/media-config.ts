/**
 * Single source of truth for upload limits and allowed file types.
 * Nothing else in the codebase should hardcode a size limit or MIME
 * allowlist — import from here so a limit only ever needs to change in
 * one place.
 */

export type MediaPurpose = "COURSE_THUMBNAIL" | "COURSE_PREVIEW" | "LESSON_VIDEO" | "LESSON_RESOURCE";

const MB = 1024 * 1024;

export const MAX_SIZE_BYTES: Record<MediaPurpose, number> = {
  COURSE_THUMBNAIL: 5 * MB,
  COURSE_PREVIEW: 100 * MB,
  LESSON_VIDEO: 500 * MB,
  LESSON_RESOURCE: 50 * MB,
};

type MimeRule = { mime: string; extensions: string[] };

// SVG is deliberately excluded from images — an uploaded SVG can carry
// active content (script/on* handlers) and would be rendered as-is.
const IMAGE_TYPES: MimeRule[] = [
  { mime: "image/jpeg", extensions: [".jpg", ".jpeg"] },
  { mime: "image/png", extensions: [".png"] },
  { mime: "image/webp", extensions: [".webp"] },
];

const VIDEO_TYPES: MimeRule[] = [
  { mime: "video/mp4", extensions: [".mp4"] },
  { mime: "video/webm", extensions: [".webm"] },
];

const RESOURCE_TYPES: MimeRule[] = [
  { mime: "application/pdf", extensions: [".pdf"] },
  { mime: "application/zip", extensions: [".zip"] },
  { mime: "application/x-zip-compressed", extensions: [".zip"] },
  { mime: "application/msword", extensions: [".doc"] },
  {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extensions: [".docx"],
  },
  { mime: "application/vnd.ms-powerpoint", extensions: [".ppt"] },
  {
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    extensions: [".pptx"],
  },
  { mime: "text/plain", extensions: [".txt"] },
];

export const ALLOWED_TYPES: Record<MediaPurpose, MimeRule[]> = {
  COURSE_THUMBNAIL: IMAGE_TYPES,
  COURSE_PREVIEW: VIDEO_TYPES,
  LESSON_VIDEO: VIDEO_TYPES,
  LESSON_RESOURCE: RESOURCE_TYPES,
};

// Explicitly rejected regardless of any allowlist match on a spoofed MIME
// type — never usable as a downloadable lesson resource.
export const DANGEROUS_EXTENSIONS = new Set([
  ".exe",
  ".bat",
  ".cmd",
  ".ps1",
  ".js",
  ".mjs",
  ".cjs",
  ".html",
  ".htm",
  ".sh",
  ".msi",
  ".apk",
  ".jar",
  ".com",
  ".scr",
  ".vbs",
  ".wsf",
]);

export class MediaValidationError extends Error {}

function extensionOf(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx === -1 ? "" : filename.slice(idx).toLowerCase();
}

/**
 * Validates a claimed MIME type + original filename against the
 * allowlist for a purpose. Does not by itself guarantee the bytes match
 * (see file-signature.ts for that) — this is the first, cheap gate.
 */
export function assertAllowedType(purpose: MediaPurpose, mimeType: string, originalFilename: string) {
  const ext = extensionOf(originalFilename);

  if (DANGEROUS_EXTENSIONS.has(ext)) {
    throw new MediaValidationError(`Files of type "${ext}" cannot be uploaded.`);
  }

  const rules = ALLOWED_TYPES[purpose];
  const match = rules.find((r) => r.mime === mimeType.toLowerCase());
  if (!match) {
    throw new MediaValidationError(
      `"${mimeType || "unknown file type"}" is not an allowed file type for this upload.`,
    );
  }
  if (ext && !match.extensions.includes(ext)) {
    throw new MediaValidationError(
      `The file extension "${ext}" doesn't match its content type. Please re-export and try again.`,
    );
  }
}

export function assertWithinSizeLimit(purpose: MediaPurpose, sizeBytes: number) {
  const max = MAX_SIZE_BYTES[purpose];
  if (sizeBytes > max) {
    throw new MediaValidationError(
      `File is too large (${(sizeBytes / MB).toFixed(1)} MB). Maximum for this upload is ${(max / MB).toFixed(0)} MB.`,
    );
  }
}
