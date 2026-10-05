import { resolve } from "node:path";

import { getServerEnv } from "../env";
import { LocalStorageProvider } from "./local-storage-provider";
import { S3StorageProvider } from "./s3-storage-provider";
import type { StorageProvider } from "./storage-provider";

export type {
  StorageProvider,
  ReadResult,
  RangeSpec,
  StoredObjectMetadata,
  DirectUploadRequest,
  DirectUploadTicket,
} from "./storage-provider";

export type StorageKind = "LOCAL" | "S3";

const cache = new Map<StorageKind, StorageProvider>();

/**
 * Provider for a SPECIFIC kind. Existing assets are always read/deleted via
 * the provider recorded on their row (Asset.storageProvider), so switching
 * STORAGE_PROVIDER never strands old files.
 */
export function getStorageProviderFor(kind: StorageKind): StorageProvider {
  const existing = cache.get(kind);
  if (existing) return existing;
  const env = getServerEnv();

  let provider: StorageProvider;
  if (kind === "LOCAL") {
    provider = new LocalStorageProvider(resolve(process.cwd(), env.LOCAL_STORAGE_ROOT));
  } else {
    if (!env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
      throw new Error(
        "This asset is stored in S3 but the S3_* environment variables are not configured.",
      );
    }
    provider = new S3StorageProvider({
      bucket: env.S3_BUCKET,
      region: env.S3_REGION,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      endpoint: env.S3_ENDPOINT,
    });
  }
  cache.set(kind, provider);
  return provider;
}

/** Provider used for NEW uploads (per STORAGE_PROVIDER). */
export function getStorageProvider(): StorageProvider {
  return getStorageProviderFor(getServerEnv().STORAGE_PROVIDER === "s3" ? "S3" : "LOCAL");
}
