/**
 * Storage provider abstraction (Phase 7).
 *
 * Nothing outside src/server/storage/ or src/server/media/ should ever
 * touch `fs`, a bucket SDK, or a raw file path for uploaded media. Routes
 * and services call this interface; `index.ts` decides which concrete
 * provider backs it based on STORAGE_PROVIDER.
 *
 * Today only a LOCAL (filesystem) provider is implemented — see
 * local-storage-provider.ts. It's fine for local development but is not a
 * production object store. A production provider (S3/R2/GCS/etc.) should
 * implement this same interface; nothing above this layer would need to
 * change.
 */

export type StoredObjectMetadata = {
  sizeBytes: number;
  /** Best-effort last-modified time, used for cache headers. */
  lastModified?: Date;
};

export type RangeSpec = { start: number; end: number };

export type ReadResult = {
  /** Node Readable stream — callers must consume or destroy it. */
  stream: NodeJS.ReadableStream;
  sizeBytes: number;
  /** Present when the provider honored a byte-range request. */
  range?: RangeSpec;
};

export interface StorageProvider {
  readonly kind: "LOCAL";

  /**
   * Persists a readable stream/buffer under `key`. Callers are
   * responsible for generating a safe, unique `key`
   * (see src/server/media/media-keys.ts) — this method trusts it
   * completely and never derives it from user input itself.
   */
  save(key: string, data: NodeJS.ReadableStream | Buffer): Promise<StoredObjectMetadata>;

  /** Idempotent — deleting a key that doesn't exist is not an error. */
  delete(key: string): Promise<void>;

  /** Metadata only, no bytes. Throws if the key doesn't exist. */
  stat(key: string): Promise<StoredObjectMetadata>;

  /**
   * Opens a stream for the object, optionally scoped to a byte range
   * (used for HTTP Range requests on video). Throws if the key doesn't
   * exist.
   */
  read(key: string, range?: RangeSpec): Promise<ReadResult>;
}
