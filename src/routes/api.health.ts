import { createFileRoute } from "@tanstack/react-router";

/** Liveness: answers immediately, touches nothing (no DB, no config, no secrets). */
export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () =>
        new Response(JSON.stringify({ status: "ok" }), {
          status: 200,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        }),
    },
  },
});
