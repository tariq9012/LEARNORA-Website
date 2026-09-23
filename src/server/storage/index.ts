import { resolve } from "node:path";

import { getServerEnv } from "../env";
import { LocalStorageProvider } from "./local-storage-provider";
import type { StorageProvider } from "./storage-provider";

export type { StorageProvider, ReadResult, RangeSpec, StoredObjectMetadata } from "./storage-provider";

let cached: StorageProvider | undefined;

/**
 * Returns the configured storage provider. This is the ONLY place that
 * decides which concrete provider backs the app — everything else
 * (routes, services) depends on the StorageProvider interface only.
 *
 * Production readiness: STORAGE_PROVIDER currently only accepts "local".
 * Adding a real object-storage provider (S3/R2/GCS) means implementing
 * StorageProvider in storage/ and adding a case here — no other file in
 * the codebase should need to change.
 */
export function getStorageProvider(): StorageProvider {
  if (cached) return cached;
  const env = getServerEnv();

  switch (env.STORAGE_PROVIDER) {
    case "local": {
      const root = resolve(process.cwd(), env.LOCAL_STORAGE_ROOT);
      cached = new LocalStorageProvider(root);
      return cached;
    }
    default: {
      // Exhaustiveness guard — the zod schema only allows "local" today.
      const unreachable: never = env.STORAGE_PROVIDER;
      throw new Error(`Unsupported STORAGE_PROVIDER: ${String(unreachable)}`);
    }
  }
}
