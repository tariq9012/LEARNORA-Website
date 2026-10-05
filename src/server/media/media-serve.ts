import { Readable } from "node:stream";

import * as assetRepository from "../repositories/asset-repository";
import { getStorageProviderFor } from "../storage";
import { sanitizeDisplayFilename } from "./media-keys";

function isObjectMissing(error: unknown): boolean {
  const e = error as { name?: string; code?: string; $metadata?: { httpStatusCode?: number } };
  return (
    e?.code === "ENOENT" ||
    e?.name === "NotFound" ||
    e?.name === "NoSuchKey" ||
    e?.$metadata?.httpStatusCode === 404
  );
}

/** Short identifier such as "AccessDenied" / "403" / "ECONNREFUSED"; nothing else is logged. */
function safeErrorCode(error: unknown): string {
  const e = error as { name?: string; code?: string; $metadata?: { httpStatusCode?: number } };
  const status = e?.$metadata?.httpStatusCode;
  const label = [e?.name, e?.code].find(
    (v) => typeof v === "string" && /^[A-Za-z0-9_]{2,40}$/.test(v),
  );
  return [label, status].filter(Boolean).join("/") || "unknown";
}

function parseRangeHeader(rangeHeader: string | null, sizeBytes: number) {
  if (!rangeHeader) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) return null;

  const [, startStr, endStr] = match;
  if (!startStr && !endStr) return null;

  let start: number;
  let end: number;
  if (startStr === "") {
    // Suffix range: last N bytes.
    const suffixLength = Number(endStr);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0, sizeBytes - suffixLength);
    end = sizeBytes - 1;
  } else {
    start = Number(startStr);
    end = endStr === "" ? sizeBytes - 1 : Number(endStr);
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start < 0) return null;
  return { start, end: Math.min(end, sizeBytes - 1) };
}

/**
 * Serves an Asset's bytes as a streamed Response. Caller is responsible
 * for the access-control decision (see media-access-service.ts) — this
 * function only streams once that's already been approved.
 *
 * `disposition: "attachment"` sets a Content-Disposition download header
 * with a sanitized filename (for lesson resources); `"inline"` (default,
 * used for images/video) lets the browser render it directly.
 */
export async function serveAssetResponse(
  assetId: string,
  request: Request,
  opts?: { disposition?: "inline" | "attachment" },
): Promise<Response> {
  const asset = await assetRepository.findAssetById(assetId);
  if (!asset) return new Response("Not found.", { status: 404 });

  const storage = getStorageProviderFor(asset.storageProvider);
  const disposition = opts?.disposition ?? "inline";

  let sizeBytes: number;
  try {
    sizeBytes = (await storage.stat(asset.storageKey)).sizeBytes;
  } catch (error) {
    if (isObjectMissing(error)) {
      return new Response("File is missing from storage.", { status: 404 });
    }
    // Anything else (wrong/insufficient storage credentials, network, outage)
    // is NOT "file missing". Log a short safe code so it can be diagnosed —
    // never the message, which can contain endpoints or key ids.
    console.error(
      `[media] storage error provider=${asset.storageProvider} assetId=${asset.id} code=${safeErrorCode(error)}`,
    );
    return new Response("Storage is temporarily unavailable.", { status: 502 });
  }

  const range = parseRangeHeader(request.headers.get("range"), sizeBytes);

  const headers = new Headers({
    "Content-Type": asset.mimeType,
    "Accept-Ranges": "bytes",
    // Phase 15: never let a browser sniff an uploaded file into an executable type.
    "X-Content-Type-Options": "nosniff",
    // Private lesson videos/resources must never be cached by a shared
    // proxy; public thumbnails are fine to cache briefly.
    "Cache-Control": disposition === "attachment" ? "private, no-store" : "private, max-age=3600",
  });
  if (disposition === "attachment") {
    const safeName = sanitizeDisplayFilename(asset.originalFilename).replace(/[^\x20-\x7e]/g, "_");
    headers.set("Content-Disposition", `attachment; filename="${safeName}"`);
  }

  if (range) {
    const { stream, range: appliedRange } = await storage.read(asset.storageKey, range);
    headers.set("Content-Range", `bytes ${appliedRange!.start}-${appliedRange!.end}/${sizeBytes}`);
    headers.set("Content-Length", String(appliedRange!.end - appliedRange!.start + 1));
    return new Response(Readable.toWeb(stream as Readable) as never, {
      status: 206,
      headers,
    });
  }

  const { stream } = await storage.read(asset.storageKey);
  headers.set("Content-Length", String(sizeBytes));
  return new Response(Readable.toWeb(stream as Readable) as never, { status: 200, headers });
}
