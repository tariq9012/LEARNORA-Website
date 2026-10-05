import { useCallback, useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { getUnreadCountsFn } from "@/server/functions/notifications";
import type { UnreadCountsDto } from "@/server/dto/communication";

/**
 * Refresh strategy (Phase 11 polling + Phase 12 SSE on top):
 *  - Mutations call requestCommRefresh(), so badges and lists update at once
 *    without F5.
 *  - An authenticated SSE connection to /api/events (see useRealtimeConnection
 *    below) delivers a near-instant HINT ("something changed") whenever the
 *    server publishes one; the hint just calls requestCommRefresh(), which
 *    re-fetches through the normal authorized server functions — SSE never
 *    carries the data itself.
 *  - Light polling while the tab is VISIBLE (unread badges every 30 s, an
 *    open inbox every 20 s) keeps working UNCONDITIONALLY, whether or not
 *    SSE is connected — this is the fallback Phase 12 was told to preserve,
 *    not a backup that only runs when SSE fails.
 *  - Any future push transport only needs to call requestCommRefresh(); no
 *    other UI code changes.
 */
export const COMM_REFRESH_EVENT = "learnora:comm-refresh";
export const UNREAD_POLL_MS = 30_000;

const SSE_URL = "/api/events";
const SSE_RECONNECT_BASE_MS = 2_000;
const SSE_RECONNECT_MAX_MS = 30_000;
const SSE_EVENT_TYPES = [
  "notification_changed",
  "message_changed",
  "payout_changed",
  "refund_changed",
  "report_changed",
] as const;

/**
 * One shared EventSource per tab, reference-counted so multiple components
 * (sidebar badges + an open inbox, say) mounting useRealtimeConnection()
 * don't each open their own connection. Reconnects with backoff on error;
 * polling (above) covers everything in between regardless.
 */
let sseRefCount = 0;
let sseSource: EventSource | null = null;
let sseReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let sseReconnectDelay = SSE_RECONNECT_BASE_MS;
// Consecutive failures with no successful "connected" in between. When the server
// has the stream switched off (or keeps failing) we stop retrying for this page
// load; polling is the fallback anyway.
let sseFailuresWithoutConnect = 0;
const SSE_GIVE_UP_AFTER = 3;

function connectSse() {
  if (typeof window === "undefined" || typeof EventSource === "undefined" || sseSource) return;
  const source = new EventSource(SSE_URL, { withCredentials: true });
  sseSource = source;

  source.addEventListener("connected", () => {
    sseReconnectDelay = SSE_RECONNECT_BASE_MS; // a real connection resets backoff
    sseFailuresWithoutConnect = 0;
  });
  for (const type of SSE_EVENT_TYPES) {
    // The payload is intentionally empty ({}) — the event name IS the message; requestCommRefresh() re-fetches via normal authorized calls.
    source.addEventListener(type, () => requestCommRefresh());
  }
  source.onerror = () => {
    source.close();
    if (sseSource === source) sseSource = null;
    sseFailuresWithoutConnect += 1;
    if (sseFailuresWithoutConnect >= SSE_GIVE_UP_AFTER) return;
    if (sseRefCount > 0 && !sseReconnectTimer) {
      sseReconnectTimer = setTimeout(() => {
        sseReconnectTimer = null;
        sseReconnectDelay = Math.min(sseReconnectDelay * 2, SSE_RECONNECT_MAX_MS);
        connectSse();
      }, sseReconnectDelay);
    }
  };
}

function disconnectSseRef() {
  sseRefCount = Math.max(0, sseRefCount - 1);
  if (sseRefCount === 0) {
    if (sseReconnectTimer) {
      clearTimeout(sseReconnectTimer);
      sseReconnectTimer = null;
    }
    sseSource?.close();
    sseSource = null;
    sseReconnectDelay = SSE_RECONNECT_BASE_MS;
  }
}

/**
 * Opens (or joins) the shared SSE connection for as long as the calling
 * component is mounted. Safe to call from several components at once —
 * unsupported browsers and any connection failure just leave polling as the
 * only refresh path, which is why this returns nothing and callers don't
 * need to branch on it.
 */
export function useRealtimeConnection(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    sseRefCount += 1;
    connectSse();
    return () => disconnectSseRef();
  }, [enabled]);
}

export function requestCommRefresh() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(COMM_REFRESH_EVENT));
}

/** Runs `callback` on the refresh event, when the tab becomes visible again, and every `intervalMs` while visible. */
export function usePollingRefresh(callback: () => void, intervalMs: number, enabled = true) {
  const latest = useRef(callback);
  latest.current = callback;

  useEffect(() => {
    if (!enabled) return;
    const run = () => {
      if (document.visibilityState === "visible") latest.current();
    };
    const timer = window.setInterval(run, intervalMs);
    window.addEventListener(COMM_REFRESH_EVENT, run);
    document.addEventListener("visibilitychange", run);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(COMM_REFRESH_EVENT, run);
      document.removeEventListener("visibilitychange", run);
    };
  }, [intervalMs, enabled]);
}

/** Real unread notification/message counts for the sidebar badges. */
export function useUnreadCounts(enabled = true): UnreadCountsDto {
  const [counts, setCounts] = useState<UnreadCountsDto>({ notifications: 0, messages: 0 });
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const load = useCallback(async () => {
    try {
      setCounts(await getUnreadCountsFn());
    } catch {
      // Badges are a convenience — never break the page over them.
    }
  }, []);

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, pathname, load]);

  usePollingRefresh(() => void load(), UNREAD_POLL_MS, enabled);
  return counts;
}

/** Random per-message idempotency key (falls back if crypto.randomUUID is unavailable). */
export function newClientMessageId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}
