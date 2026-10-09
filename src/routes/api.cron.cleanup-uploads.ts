import { createFileRoute } from "@tanstack/react-router";

/**
 * Phase 19 — scheduled cleanup of abandoned direct uploads (Vercel Cron).
 *
 * Same logic as `npm run media:cleanup-intents --execute` (plus, since Phase 20, a
 * bounded sweep of expired rate-limit rows): deletes only objects
 * whose upload intent was never finalized and is older than the finalize window
 * plus grace, and never anything an Asset row references. Idempotent, bounded
 * to one batch per call, and the response contains counts only.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>`; with no CRON_SECRET configured
 * the endpoint answers 503 and does nothing. GET only (that is what Vercel Cron
 * sends); it is not linked from anywhere and carries no session/CSRF state.
 */
const BATCH_LIMIT = 200;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

export const Route = createFileRoute("/api/cron/cleanup-uploads")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { getServerEnv } = await import("@/server/env");
        const { checkCronAuth } = await import("@/server/lib/cron-auth");
        const auth = checkCronAuth(
          request.headers.get("authorization"),
          getServerEnv().CRON_SECRET,
        );
        if (auth === "not_configured") return json({ error: "cron_not_configured" }, 503);
        if (auth !== "ok") return json({ error: "unauthorized" }, 401);

        const requestId = (await import("@/server/lib/log")).newRequestId();
        const { log } = await import("@/server/lib/log");
        try {
          const { cleanupAbandonedUploads } = await import("@/server/media/direct-upload-service");
          const { purgeExpiredRateLimitBuckets } = await import("@/server/auth/rate-limit");
          const s = await cleanupAbandonedUploads({ execute: true, limit: BATCH_LIMIT });
          // Housekeeping for the Phase 20 database-backed rate limiter (bounded batch).
          const rateLimitBucketsPurged = await purgeExpiredRateLimitBuckets();
          log.info("cron.cleanup_uploads", {
            requestId,
            scanned: s.scanned,
            objectsDeleted: s.objectsDeleted,
            intentsRemoved: s.intentsRemoved,
            skippedHasAsset: s.skippedHasAsset,
            errors: s.errors,
            rateLimitBucketsPurged,
          });
          return json(
            {
              scanned: s.scanned,
              objectsDeleted: s.objectsDeleted,
              intentsRemoved: s.intentsRemoved,
              skippedHasAsset: s.skippedHasAsset,
              errors: s.errors,
              rateLimitBucketsPurged,
              moreMayRemain: s.scanned >= BATCH_LIMIT,
            },
            s.errors > 0 ? 500 : 200,
          );
        } catch (error) {
          log.error("cron.cleanup_uploads_failed", error, { requestId });
          return json({ error: "cleanup_failed" }, 500);
        }
      },
    },
  },
});
