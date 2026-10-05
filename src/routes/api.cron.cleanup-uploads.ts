import { createFileRoute } from "@tanstack/react-router";

/**
 * Phase 19 — scheduled cleanup of abandoned direct uploads (Vercel Cron).
 *
 * Same logic as `npm run media:cleanup-intents --execute`: deletes only objects
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

        try {
          const { cleanupAbandonedUploads } = await import("@/server/media/direct-upload-service");
          const s = await cleanupAbandonedUploads({ execute: true, limit: BATCH_LIMIT });
          console.log(
            `[cron] cleanup-uploads scanned=${s.scanned} objectsDeleted=${s.objectsDeleted} intentsRemoved=${s.intentsRemoved} skippedHasAsset=${s.skippedHasAsset} errors=${s.errors}`,
          );
          return json(
            {
              scanned: s.scanned,
              objectsDeleted: s.objectsDeleted,
              intentsRemoved: s.intentsRemoved,
              skippedHasAsset: s.skippedHasAsset,
              errors: s.errors,
              moreMayRemain: s.scanned >= BATCH_LIMIT,
            },
            s.errors > 0 ? 500 : 200,
          );
        } catch (error) {
          console.error(
            `[cron] cleanup-uploads failed code=${error instanceof Error ? error.name : "unknown"}`,
          );
          return json({ error: "cleanup_failed" }, 500);
        }
      },
    },
  },
});
