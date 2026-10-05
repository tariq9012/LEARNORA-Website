import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "node:stream";

import type {
  DirectUploadRequest,
  DirectUploadTicket,
  RangeSpec,
  ReadResult,
  StorageProvider,
  StoredObjectMetadata,
} from "./storage-provider";

export type S3StorageConfig = {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Set for R2 / MinIO / other S3-compatible services; omit for AWS S3. */
  endpoint?: string | undefined;
};

/** Keys are server-generated (media-keys.ts); this is defence in depth. */
const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9/_.-]{0,511}$/;

function assertSafeKey(key: string) {
  if (!SAFE_KEY.test(key) || key.includes("..") || key.includes("//") || key.endsWith("/")) {
    throw new Error("Invalid storage key");
  }
}

/**
 * S3-compatible object storage. The bucket stays PRIVATE: bytes only leave
 * through Learnora's authorized media route (media-serve.ts), which streams
 * them with Range support. No object URL or signed URL is ever handed to the
 * browser, so enrollment/entitlement checks cannot be bypassed.
 */
export class S3StorageProvider implements StorageProvider {
  readonly kind = "S3" as const;
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly config: S3StorageConfig;
  private presignClient: S3Client | undefined;

  constructor(config: S3StorageConfig, client?: S3Client) {
    this.config = config;
    this.bucket = config.bucket;
    this.client =
      client ??
      new S3Client({
        region: config.region,
        ...(config.endpoint && { endpoint: config.endpoint, forcePathStyle: true }),
        credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      });
  }

  /**
   * Phase 18: presigned PUT so the browser uploads straight to the private
   * bucket. The URL is signed for exactly this key, expires quickly, and binds
   * Content-Type. Pure local computation (no network call, no object created).
   *
   * Uses its own client with checksum calculation set to WHEN_REQUIRED: recent
   * AWS SDKs otherwise add `x-amz-checksum-*` parameters to presigned PUTs,
   * which Cloudflare R2 does not accept. The main client is left untouched so
   * the already-working server-side save() path is unchanged.
   *
   * Size is NOT part of the signature on purpose (see DEPLOYMENT.md): the
   * authoritative size/type check is the HEAD performed at finalize.
   */
  async createDirectUpload(request: DirectUploadRequest): Promise<DirectUploadTicket> {
    assertSafeKey(request.key);
    this.presignClient ??= new S3Client({
      region: this.config.region,
      ...(this.config.endpoint && { endpoint: this.config.endpoint, forcePathStyle: true }),
      credentials: {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
      },
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
    const url = await getSignedUrl(
      this.presignClient,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: request.key,
        ContentType: request.contentType,
      }),
      { expiresIn: request.expiresInSeconds, signableHeaders: new Set(["content-type"]) },
    );
    return {
      method: "PUT",
      url,
      headers: { "Content-Type": request.contentType },
      expiresAt: new Date(Date.now() + request.expiresInSeconds * 1000),
    };
  }

  async save(key: string, data: NodeJS.ReadableStream | Buffer): Promise<StoredObjectMetadata> {
    assertSafeKey(key);
    if (Buffer.isBuffer(data)) {
      await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data }));
    } else {
      // Multipart streaming upload: never buffers the whole file. If the
      // source stream errors (e.g. magic-byte validation), the upload is
      // aborted and the partial parts are discarded.
      const upload = new Upload({
        client: this.client,
        params: { Bucket: this.bucket, Key: key, Body: data as Readable },
        queueSize: 3,
        partSize: 8 * 1024 * 1024,
        leavePartsOnError: false,
      });
      await upload.done();
    }
    return this.stat(key);
  }

  async delete(key: string): Promise<void> {
    assertSafeKey(key);
    // S3 DeleteObject succeeds for missing keys, so this is idempotent.
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async stat(key: string): Promise<StoredObjectMetadata> {
    assertSafeKey(key);
    const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
    return {
      sizeBytes: Number(head.ContentLength ?? 0),
      ...(head.LastModified && { lastModified: head.LastModified }),
      ...(head.ContentType && { contentType: head.ContentType }),
    };
  }

  async read(key: string, range?: RangeSpec): Promise<ReadResult> {
    assertSafeKey(key);
    const res = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ...(range && { Range: `bytes=${Math.max(0, range.start)}-${range.end}` }),
      }),
    );
    if (!res.Body) throw new Error("Empty object body");
    const stream = res.Body as Readable;

    if (range) {
      // "bytes 0-99/1234" -> total 1234
      const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(res.ContentRange ?? "");
      if (!match) throw new Error("Storage did not honor the range request");
      return {
        stream,
        sizeBytes: Number(match[3]),
        range: { start: Number(match[1]), end: Number(match[2]) },
      };
    }
    return { stream, sizeBytes: Number(res.ContentLength ?? 0) };
  }
}
