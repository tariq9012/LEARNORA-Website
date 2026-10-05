/**
 * Removes abandoned direct uploads (Phase 18).
 *
 * A direct upload can leave an object in R2 that was never finalized (tab closed,
 * network died, upload rejected at finalize). This deletes ONLY objects whose
 * upload intent was never finalized AND whose finalize window (2 h) plus a 1 h
 * grace has passed, then removes those intent rows. It never touches finalized
 * uploads or any object an Asset row references.
 *
 * It is NOT automatic. Run it by hand, or schedule it later (Vercel Cron, GitHub
 * Actions, a cron job on any machine that has the production env vars).
 *
 *   npm run media:cleanup-intents                  # DRY RUN: reports, deletes nothing
 *   npm run media:cleanup-intents -- --execute     # actually deletes
 *   npm run media:cleanup-intents -- --execute --limit=500 --grace-minutes=120
 *
 * Needs the same env as the app (DATABASE_URL, SESSION_SECRET, S3_*, ...).
 * Output contains counts only — never keys, URLs or credentials.
 */
import "dotenv/config";

import { cleanupAbandonedUploads } from "../src/server/media/direct-upload-service";

function numberArg(name: string): number | undefined {
  const raw = process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    console.error(`--${name} must be a non-negative number`);
    process.exit(2);
  }
  return n;
}

async function main() {
  const execute = process.argv.includes("--execute");
  const limit = numberArg("limit");
  const graceMinutes = numberArg("grace-minutes");
  const summary = await cleanupAbandonedUploads({
    execute,
    ...(limit !== undefined && { limit }),
    ...(graceMinutes !== undefined && { graceMs: graceMinutes * 60_000 }),
  });
  console.log(summary.dryRun ? "DRY RUN (nothing deleted). Add --execute to delete." : "EXECUTED.");
  console.log(`  abandoned intents found:      ${summary.scanned}`);
  console.log(`  objects deleted from storage: ${summary.objectsDeleted}`);
  console.log(`  intent rows removed:          ${summary.intentsRemoved}`);
  console.log(`  skipped (an Asset uses it):   ${summary.skippedHasAsset}`);
  console.log(`  errors:                       ${summary.errors}`);
  if (summary.errors > 0) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    // Never print the error object: it can contain connection details.
    console.error("Cleanup failed:", error instanceof Error ? error.name : "unknown error");
    process.exitCode = 1;
  })
  .finally(async () => {
    const { prisma } = await import("../src/server/db/client");
    await prisma.$disconnect();
  });
