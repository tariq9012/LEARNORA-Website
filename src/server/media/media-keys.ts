import { randomUUID } from "node:crypto";

import { toStorageKey } from "../storage/local-storage-provider";
import type { MediaPurpose } from "./media-config";

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "application/pdf": "pdf",
  "application/zip": "zip",
  "application/x-zip-compressed": "zip",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/plain": "txt",
};

/** Falls back to a generic extension if a mapped one isn't found — never trusts the client's filename for this. */
function extensionForMime(mimeType: string): string {
  return EXT_BY_MIME[mimeType.toLowerCase()] ?? "bin";
}

/**
 * Storage key for a user's avatar. Keyed by userId (not an asset id, since
 * none exists yet at call time) and a fresh uuid so replacing an avatar
 * never collides with — or needs to overwrite — the previous file; the old
 * one is deleted separately once the new one is safely written (see
 * replaceAsset() in media-service.ts).
 */
export function generateAvatarStorageKey(userId: string, mimeType: string): string {
  const ext = extensionForMime(mimeType);
  return toStorageKey("avatars", userId, `${randomUUID()}.${ext}`);
}

/**
 * Builds a safe, unique, server-controlled storage key. The instructor's
 * original filename is kept only as display metadata (Asset.originalFilename)
 * — it never influences where the file actually lives on disk, so there is
 * no path-traversal or filename-collision surface here.
 */
export function generateStorageKey(params: {
  purpose: MediaPurpose;
  mimeType: string;
  courseId: string;
  lessonId?: string;
}): string {
  const ext = extensionForMime(params.mimeType);
  const id = randomUUID();

  switch (params.purpose) {
    case "COURSE_THUMBNAIL":
      return toStorageKey("courses", params.courseId, "thumbnail", `${id}.${ext}`);
    case "COURSE_PREVIEW":
      return toStorageKey("courses", params.courseId, "preview", `${id}.${ext}`);
    case "LESSON_VIDEO":
      if (!params.lessonId) throw new Error("lessonId is required for LESSON_VIDEO");
      return toStorageKey(
        "courses",
        params.courseId,
        "lessons",
        params.lessonId,
        "video",
        `${id}.${ext}`,
      );
    case "LESSON_RESOURCE":
      if (!params.lessonId) throw new Error("lessonId is required for LESSON_RESOURCE");
      return toStorageKey(
        "courses",
        params.courseId,
        "lessons",
        params.lessonId,
        "resources",
        `${id}.${ext}`,
      );
    case "AVATAR":
      // Avatars aren't course-scoped — use generateAvatarStorageKey() instead.
      throw new Error("generateAvatarStorageKey() should be used for AVATAR uploads");
  }
}

/** Sanitizes an original filename for safe use in a Content-Disposition header only — never for disk paths. */
export function sanitizeDisplayFilename(filename: string): string {
  const trimmed = filename.trim().replace(/[\r\n"\\]/g, "_");
  return trimmed.length > 0 ? trimmed.slice(0, 255) : "download";
}
