import { createFileRoute } from "@tanstack/react-router";

import { getCurrentUser } from "@/server/auth/guards";
import { getServerEnv } from "@/server/env";
import {
  isRealtimeStreamEnabled,
  subscribe,
  type CommEventType,
} from "@/server/services/realtime-service";

/**
 * Phase 12 — authenticated Server-Sent Events stream for near-instant
 * communication refresh. Tied to the session cookie exactly like every other
 * server function: `getCurrentUser()` is the same auth check the rest of the
 * app uses, so an expired/revoked session gets 401 here too, and there is no
 * userId query param of any kind — a client can only ever subscribe as
 * itself.
 *
 * Payload discipline: every event written to the stream is one of the plain
 * category strings in CommEventType (see realtime-service.ts) — never a
 * message body, payment data, or the session token. The client's only
 * reaction is to call requestCommRefresh(), which re-fetches through the
 * normal authorized server functions.
 *
 * This endpoint is a single-instance, best-effort convenience: see
 * realtime-service.ts's module comment for the horizontal-scaling caveat,
 * and lib/comm-refresh.ts for the polling fallback that keeps working
 * whether or not this connects at all.
 */

const HEARTBEAT_MS = 20_000;

export const Route = createFileRoute("/api/events")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // 204 tells EventSource to stop (the client also gives up after a few
        // failed attempts, see lib/comm-refresh.ts); polling keeps working.
        if (!isRealtimeStreamEnabled(getServerEnv())) {
          return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
        }
        const user = await getCurrentUser();
        if (!user) return new Response("Unauthorized", { status: 401 });

        const encoder = new TextEncoder();
        let unsubscribe: (() => void) | null = null;
        let heartbeat: ReturnType<typeof setInterval> | null = null;

        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            const send = (event: CommEventType) => {
              controller.enqueue(encoder.encode(`event: ${event}\ndata: {}\n\n`));
            };
            // Lets the client confirm the stream is live before the first real event.
            controller.enqueue(encoder.encode(`event: connected\ndata: {}\n\n`));

            unsubscribe = subscribe(user.id, { send });

            // Keeps intermediary proxies/load balancers from closing an idle connection.
            heartbeat = setInterval(() => {
              try {
                controller.enqueue(encoder.encode(`: heartbeat\n\n`));
              } catch {
                cleanup();
              }
            }, HEARTBEAT_MS);

            const cleanup = () => {
              if (heartbeat) clearInterval(heartbeat);
              unsubscribe?.();
              try {
                controller.close();
              } catch {
                // already closed
              }
            };
            request.signal.addEventListener("abort", cleanup);
          },
          cancel() {
            if (heartbeat) clearInterval(heartbeat);
            unsubscribe?.();
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          },
        });
      },
    },
  },
});
