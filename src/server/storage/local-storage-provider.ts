import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat as fsStat } from "node:fs/promises";
import { dirname, join, normalize, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

import type {
  RangeSpec,
  ReadResult,
  StorageProvider,
  StoredObjectMetadata,
} from "./storage-provider";

/**
 * Real local-disk storage for development.
 *
 * IMPORTANT: this is a LOCAL DEVELOPMENT provider only. It is not a
 * production object store — no redundancy, no CDN, no multi-instance
 * support. A production deployment must swap this for an object-storage
 * provider that implements the same StorageProvider interface (see
 * storage-provider.ts). Nothing above this layer needs to change when
 * that happens.
 */
export class LocalStorageProvider implements StorageProvider {
  readonly kind = "LOCAL" as const;

  constructor(private readonly rootDir: string) {}

  /**
   * Resolves a storage key to an absolute path, refusing anything that
   * would escape rootDir (path traversal). Keys are always
   * server-generated (see media-keys.ts) and never taken from a client
   * path, but this check stays as defense in depth.
   */
  private resolvePath(key: string): string {
    if (key.includes("\0")) throw new Error("Invalid storage key");
    const normalizedRoot = resolve(this.rootDir);
    const candidate = resolve(normalizedRoot, normalize(key));
    if (candidate !== normalizedRoot && !candidate.startsWith(normalizedRoot + sep)) {
      throw new Error("Invalid storage key: path traversal attempt");
    }
    return candidate;
  }

  async save(key: string, data: NodeJS.ReadableStream | Buffer): Promise<StoredObjectMetadata> {
    const path = this.resolvePath(key);
    await mkdir(dirname(path), { recursive: true });

    const source = Buffer.isBuffer(data) ? Readable.from(data) : data;
    const writeStream = createWriteStream(path, { flags: "wx" });
    try {
      await pipeline(source, writeStream);
    } catch (error) {
      // Never leave a half-written file behind on failure.
      await rm(path, { force: true }).catch(() => undefined);
      throw error;
    }

    const stats = await fsStat(path);
    return { sizeBytes: stats.size, lastModified: stats.mtime };
  }

  async delete(key: string): Promise<void> {
    const path = this.resolvePath(key);
    await rm(path, { force: true });
  }

  async stat(key: string): Promise<StoredObjectMetadata> {
    const path = this.resolvePath(key);
    const stats = await fsStat(path);
    return { sizeBytes: stats.size, lastModified: stats.mtime };
  }

  async read(key: string, range?: RangeSpec): Promise<ReadResult> {
    const path = this.resolvePath(key);
    const stats = await fsStat(path);

    if (range) {
      const start = Math.max(0, range.start);
      const end = Math.min(stats.size - 1, range.end);
      const stream = createReadStream(path, { start, end });
      return { stream, sizeBytes: stats.size, range: { start, end } };
    }

    const stream = createReadStream(path);
    return { stream, sizeBytes: stats.size };
  }

  /** Used only by media-keys.ts's uniqueness dance — not part of the interface. */
  toAbsolutePath(key: string): string {
    return this.resolvePath(key);
  }
}

/** Joins a storage key the same way regardless of platform path separators. */
export function toStorageKey(...parts: string[]): string {
  return parts.join("/");
}

export function toLocalRelativePath(key: string): string {
  return join(...key.split("/"));
}
