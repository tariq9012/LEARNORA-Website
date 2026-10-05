import { createFileRoute } from "@tanstack/react-router";

/**
 * Readiness: configuration parses and the database answers a trivial query
 * (2s cap). It never writes, never creates storage objects and never sends
 * email. Failures return only which check failed — no messages, URLs or
 * credentials.
 */
export const Route = createFileRoute("/api/ready")({
  server: {
    handlers: {
      GET: async () => {
        const checks: Record<string, "ok" | "fail"> = { config: "fail", database: "fail" };
        try {
          const { getServerEnv } = await import("@/server/env");
          getServerEnv();
          checks["config"] = "ok";
        } catch {
          /* reported as fail below */
        }
        if (checks["config"] === "ok") {
          try {
            const { prisma } = await import("@/server/db/client");
            await Promise.race([
              prisma.$queryRaw`SELECT 1`,
              new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 2000)),
            ]);
            checks["database"] = "ok";
          } catch {
            /* reported as fail below */
          }
        }
        const ready = Object.values(checks).every((c) => c === "ok");
        return new Response(JSON.stringify({ status: ready ? "ready" : "not_ready", checks }), {
          status: ready ? 200 : 503,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      },
    },
  },
});
