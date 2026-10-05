/**
 * Storage provider abstraction (Phase 7).
 *
 * Nothing outside src/server/storage/ or src/server/media/ should ever
 * touch `fs`, a bucket SDK, or a raw file path for uploaded media. Routes
 * and services call this interface; `index.ts` decides which concrete
 * provider backs it based on STORAGE_PROVIDER.
 *
 * Implementations: LOCAL (filesystem, development / single VM with a
 * persistent volume — local-storage-provider.ts) and S3 (any S3-compatible
 * object store such as Cloudflare R2 — s3-storage-provider.ts). Each Asset row
 * records which one holds it, so old local files keep working after S3 is
 * enabled (see getStorageProviderFor in index.ts).
 */

export type StoredObjectMetadata = {
  sizeBytes: number;
  /** Best-effort last-modified time, used for cache headers. */
  lastModified?: Date;
  /** Content-Type the object was stored with (S3/R2 only). Used to verify direct uploads. */
  contentType?: string;
};

/** What the server asks a provider to authorize for ONE object (Phase 18). */
export type DirectUploadRequest = {
  /** Server-generated key (media-keys.ts) — never client input. */
  key: string;
  contentType: string;
  expiresInSeconds: number;
};

/**
 * Everything the browser needs to upload that one object, and nothing else:
 * no credentials, no bucket-wide permission. The signature only authorizes a
 * PUT to this exact key until `expiresAt`.
 */
export type DirectUploadTicket = {
  method: "PUT";
  url: string;
  /** Headers the browser MUST send exactly (they are part of the signature). */
  headers: Record<string, string>;
  expiresAt: Date;
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
  readonly kind: "LOCAL" | "S3";

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

  /**
   * Phase 18. Only providers where the browser can talk to the store directly
   * implement this (S3/R2). LOCAL does not, which is how the app knows to keep
   * using the server-mediated multipart upload for local development.
   */
  createDirectUpload?(request: DirectUploadRequest): Promise<DirectUploadTicket>;
}
