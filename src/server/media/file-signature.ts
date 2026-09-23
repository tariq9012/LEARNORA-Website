/**
 * Minimal magic-byte sniffing so an upload can't just lie about its
 * Content-Type. This is intentionally NOT a full malware/content scanner
 * — see the note in media-service.ts and the Phase 7 final report about
 * what's still a deployment-hardening task.
 *
 * Every check only needs the first few dozen bytes, so callers pass a
 * small header buffer, not the whole file.
 */

function startsWith(buf: Buffer, bytes: number[], offset = 0): boolean {
  if (buf.length < offset + bytes.length) return false;
  return bytes.every((b, i) => buf[offset + i] === b);
}

function matchesSignature(buf: Buffer, mimeType: string): boolean {
  switch (mimeType.toLowerCase()) {
    case "image/jpeg":
      return startsWith(buf, [0xff, 0xd8, 0xff]);
    case "image/png":
      return startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/webp":
      return (
        startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && // "RIFF"
        startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8) // "WEBP"
      );
    case "application/pdf":
      return startsWith(buf, [0x25, 0x50, 0x44, 0x46]); // "%PDF"
    // .docx/.pptx/.xlsx are zip containers under the hood.
    case "application/zip":
    case "application/x-zip-compressed":
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      return startsWith(buf, [0x50, 0x4b, 0x03, 0x04]) || startsWith(buf, [0x50, 0x4b, 0x05, 0x06]);
    case "video/mp4":
      // ISO base media file format: bytes 4-7 are "ftyp" for MP4.
      return startsWith(buf, [0x66, 0x74, 0x79, 0x70], 4);
    case "video/webm":
      return startsWith(buf, [0x1a, 0x45, 0xdf, 0xa3]); // EBML header
    // Legacy OLE-based .doc/.ppt and plain text aren't practical to sniff
    // reliably with a short magic number — MIME + extension allowlisting
    // (media-config.ts) is what gates these.
    case "application/msword":
    case "application/vnd.ms-powerpoint":
    case "text/plain":
      return true;
    default:
      return false;
  }
}

export class FileSignatureError extends Error {}

/**
 * Throws if the file's actual bytes don't match its claimed MIME type.
 * Pass at least the first 16 bytes of the file (32+ recommended).
 */
export function assertMatchesFileSignature(header: Buffer, mimeType: string) {
  if (!matchesSignature(header, mimeType)) {
    throw new FileSignatureError("The file's contents don't match its claimed type.");
  }
}
