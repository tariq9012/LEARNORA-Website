/**
 * Moves legacy LOCAL media (Asset.storageProvider = LOCAL) into the S3/R2 bucket.
 * Vercel has no persistent disk, so any asset still marked LOCAL is unreachable
 * there (the media route answers 404 "File is missing from storage").
 *
 *   npm run media:migrate-local            # DRY RUN: reports only, changes nothing
 *   npm run media:migrate-local -- --execute [--limit=100]
 *
 * Run it from the machine that still HAS the files, with:
 *   - LOCAL_STORAGE_ROOT pointing at the old uploads folder (default ./storage/uploads)
 *   - the S3_* variables for the target bucket and STORAGE_PROVIDER=s3
 *   - DATABASE_URL (+ SESSION_SECRET) of the database whose assets you are moving
 *
 * Guarantees:
 *   - dry run by default; --execute is required to copy or update anything
 *   - never deletes database rows and never deletes local files
 *   - never overwrites or modifies an existing bucket object: if the key already
 *     exists with a DIFFERENT size it is reported as a CONFLICT and skipped
 *   - idempotent: re-running skips assets that are already S3 (they no longer
 *     match LOCAL) and objects that already exist with the right size
 *   - the row is flipped to S3 only after the bucket object is verified (size)
 *   - only LOCAL rows are touched; existing S3 assets are never modified
 *   - output is counts and asset ids only: never keys, URLs or credentials
 */
import "dotenv/config";

import { getServerEnv } from "../src/server/env";

type Outcome =
  "would_copy" | "copied" | "already_in_bucket" | "missing_local_file" | "conflict" | "error";

function numberArg(name: string): number | undefined {
  const raw = process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    console.error(`--${name} must be a positive integer`);
    process.exit(2);
  }
  return n;
}

function isNotFound(error: unknown): boolean {
  const e = error as {
    name?: string;
    code?: string;
    $metadata?: { httpStatusCode?: number };
  } | null;
  return (
    e?.code === "ENOENT" ||
    e?.name === "NotFound" ||
    e?.name === "NoSuchKey" ||
    e?.$metadata?.httpStatusCode === 404
  );
}

async function main() {
  const execute = process.argv.includes("--execute");
  const limit = numberArg("limit");
  const env = getServerEnv();
  if (env.STORAGE_PROVIDER !== "s3") {
    console.error(
      "Set STORAGE_PROVIDER=s3 and the S3_* variables: they define the migration target.",
    );
    process.exitCode = 1;
    return;
  }

  const { prisma } = await import("../src/server/db/client");
  const { getStorageProviderFor } = await import("../src/server/storage");
  const local = getStorageProviderFor("LOCAL");
  const bucket = getStorageProviderFor("S3");

  const where = { storageProvider: "LOCAL" as const };
  const total = await prisma.asset.count({ where });
  const rows = await prisma.asset.findMany({
    where,
    orderBy: { createdAt: "asc" },
    ...(limit !== undefined && { take: limit }),
    select: { id: true, storageKey: true, sizeBytes: true, purpose: true, mimeType: true },
  });

  console.log(
    execute ? "EXECUTE mode." : "DRY RUN (nothing is copied or updated). Add --execute to migrate.",
  );
  console.log(`LOCAL assets in database: ${total}; examining ${rows.length}.`);

  const counts: Record<Outcome, number> = {
    would_copy: 0,
    copied: 0,
    already_in_bucket: 0,
    missing_local_file: 0,
    conflict: 0,
    error: 0,
  };
  const byPurpose: Record<string, number> = {};
  const problems: string[] = [];

  for (const row of rows) {
    byPurpose[row.purpose] = (byPurpose[row.purpose] ?? 0) + 1;
    let outcome: Outcome;
    try {
      let localSize: number;
      try {
        localSize = (await local.stat(row.storageKey)).sizeBytes;
      } catch (error) {
        if (isNotFound(error)) {
          counts.missing_local_file++;
          problems.push(`missing_local_file asset=${row.id}`);
          continue;
        }
        throw error;
      }

      let existing: number | null = null;
      try {
        existing = (await bucket.stat(row.storageKey)).sizeBytes;
      } catch (error) {
        if (!isNotFound(error)) throw error;
      }
      if (existing !== null && existing !== localSize) {
        counts.conflict++;
        problems.push(`conflict asset=${row.id} (bucket object exists with a different size)`);
        continue;
      }

      if (!execute) {
        outcome = existing === null ? "would_copy" : "already_in_bucket";
      } else {
        if (existing === null) {
          const { stream } = await local.read(row.storageKey);
          await bucket.save(row.storageKey, stream);
        }
        const verified = (await bucket.stat(row.storageKey)).sizeBytes;
        if (verified !== localSize) {
          counts.error++;
          problems.push(`error asset=${row.id} (size mismatch after copy; row left as LOCAL)`);
          continue;
        }
        // Compare-and-set: only a row that is still LOCAL is flipped.
        await prisma.asset.updateMany({
          where: { id: row.id, storageProvider: "LOCAL" },
          data: { storageProvider: "S3" },
        });
        outcome = existing === null ? "copied" : "already_in_bucket";
      }
      counts[outcome]++;
    } catch (error) {
      counts.error++;
      problems.push(
        `error asset=${row.id} code=${error instanceof Error ? error.name : "unknown"}`,
      );
    }
  }

  console.log("By purpose:", JSON.stringify(byPurpose));
  console.log(
    `  ${execute ? "copied" : "would copy"}:        ${execute ? counts.copied : counts.would_copy}`,
  );
  console.log(`  already in bucket${execute ? " (row updated)" : ""}: ${counts.already_in_bucket}`);
  console.log(`  local file missing:   ${counts.missing_local_file}  (re-upload these manually)`);
  console.log(`  conflicts:            ${counts.conflict}`);
  console.log(`  errors:               ${counts.error}`);
  for (const p of problems.slice(0, 50)) console.log(`    - ${p}`);
  if (problems.length > 50) console.log(`    ... and ${problems.length - 50} more`);
  if (counts.error > 0 || counts.conflict > 0) process.exitCode = 1;
  await prisma.$disconnect();
}

main().catch((error: unknown) => {
  console.error("Migration failed:", error instanceof Error ? error.name : "unknown error");
  process.exitCode = 1;
});
