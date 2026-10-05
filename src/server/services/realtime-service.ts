/**
 * Phase 12 — Server-Sent Events broker for near-instant communication
 * refresh, replacing nothing: Phase 11 polling stays as the fallback (see
 * lib/comm-refresh.ts on the client). This module holds an IN-MEMORY map of
 * userId -> open response streams and is therefore SINGLE-INSTANCE ONLY —
 * exactly like auth/rate-limit.ts's limiter. Behind more than one server
 * process a user connected to instance A never sees an event published from
 * instance B; before scaling out, replace the publish side with a shared
 * pub/sub (e.g. Redis) fanning into each instance's local subscriber set,
 * and nothing on the client needs to change.
 *
 * Payload discipline: every event is one of the four safe category strings
 * below — NEVER a message body, a payment/provider record, a session token,
 * or any other private payload. The client's only reaction to an event is to
 * call requestCommRefresh(), which re-fetches through the normal authorized
 * server functions; SSE carries a hint, not data.
 *
 * SSE delivery is always best-effort: it is called only from code that has
 * already committed (or is running independently of) the real database
 * change, and a failed/absent connection never affects anything but UI
 * refresh latency — the same guarantee Phase 11's notify() has for
 * notifications.
 */

export type CommEventType =
  | "notification_changed"
  | "message_changed"
  | "payout_changed"
  | "refund_changed"
  | "report_changed";

type Subscriber = { send: (event: CommEventType) => void };

const subscribers = new Map<string, Set<Subscriber>>();

export function subscribe(userId: string, subscriber: Subscriber): () => void {
  let set = subscribers.get(userId);
  if (!set) {
    set = new Set();
    subscribers.set(userId, set);
  }
  set.add(subscriber);
  return () => {
    set?.delete(subscriber);
    if (set && set.size === 0) subscribers.delete(userId);
  };
}

/** Fans one event out to every open connection for `userId`. Never throws — a broken pipe is dropped silently. */
export function publishCommEvent(userIds: string | string[], event: CommEventType): void {
  const ids = Array.isArray(userIds) ? userIds : [userIds];
  for (const id of ids) {
    const set = subscribers.get(id);
    if (!set) continue;
    for (const subscriber of set) {
      try {
        subscriber.send(event);
      } catch {
        // A dead connection is cleaned up by its own onDisconnect handler, not here.
      }
    }
  }
}

/** Test/ops visibility only — never exposed to a client. */
export function connectedUserCount(): number {
  return subscribers.size;
}

/**
 * Whether /api/events should hold streams open. See REALTIME_SSE in env.ts.
 * Takes the already-validated environment so it stays trivially testable.
 */
export function isRealtimeStreamEnabled(env: {
  REALTIME_SSE: "auto" | "on" | "off";
  VERCEL?: string | undefined;
}): boolean {
  if (env.REALTIME_SSE === "on") return true;
  if (env.REALTIME_SSE === "off") return false;
  return !env.VERCEL;
}
