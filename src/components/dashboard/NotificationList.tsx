import { useCallback, useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import {
  BookOpen,
  Bell,
  CreditCard,
  MessageSquare,
  Settings,
  Trophy,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Badge, Button, Card, EmptyState } from "@/components/ui/kit";
import { formatRelativeTime } from "@/lib/format";
import { requestCommRefresh, usePollingRefresh } from "@/lib/comm-refresh";
import { isSafeInternalPath } from "@/lib/safe-path";
import {
  getMyNotificationsFn,
  markAllNotificationsReadFn,
  markNotificationReadFn,
} from "@/server/functions/notifications";
import type {
  NotificationDto,
  NotificationPageDto,
  NotificationTypeDto,
} from "@/server/dto/communication";

const ICONS: Record<NotificationTypeDto, LucideIcon> = {
  ENROLLMENT: BookOpen,
  COURSE_APPROVED: BookOpen,
  COURSE_REJECTED: BookOpen,
  NEW_REVIEW: Trophy,
  NEW_MESSAGE: MessageSquare,
  PAYOUT: Wallet,
  SYSTEM: Settings,
  ANNOUNCEMENT: Bell,
  PAYMENT: CreditCard,
  REFUND: CreditCard,
  COURSE_COMPLETED: Trophy,
  CERTIFICATE_READY: Trophy,
};

export function NotificationItem({
  item,
  onOpen,
  onRead,
}: {
  item: NotificationDto;
  onOpen: (item: NotificationDto) => void;
  onRead: (item: NotificationDto) => void;
}) {
  const Icon = ICONS[item.type] ?? Bell;
  const clickable = isSafeInternalPath(item.link);
  return (
    <div className={`flex gap-4 p-4 transition-colors ${item.read ? "" : "bg-brand/5"}`}>
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-panel-2 text-brand-soft ring-1 ring-line">
        <Icon size={16} />
      </span>
      <button
        type="button"
        onClick={() => onOpen(item)}
        className={`min-w-0 flex-1 text-left ${clickable ? "cursor-pointer" : "cursor-default"}`}
      >
        <span className="flex flex-wrap items-center gap-2">
          {/* Titles/messages are rendered as plain text nodes — never as HTML. */}
          <span className="text-sm font-medium">{item.title}</span>
          {!item.read && <Badge tone="brand">New</Badge>}
        </span>
        <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
          {item.message}
        </span>
        <span className="mt-1.5 block font-mono text-[10px] text-muted-foreground">
          {formatRelativeTime(item.createdAt)}
        </span>
      </button>
      {!item.read && (
        <Button variant="ghost" size="sm" onClick={() => onRead(item)}>
          Mark read
        </Button>
      )}
    </div>
  );
}

/** Real, server-paginated notification centre for the signed-in user. Seeded from the route loader. */
export function NotificationList({ initial }: { initial: NotificationPageDto }) {
  const router = useRouter();
  const [items, setItems] = useState(initial.items);
  const [nextCursor, setNextCursor] = useState(initial.nextCursor);
  const [unread, setUnread] = useState(initial.unreadCount);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Re-seed whenever the loader hands us fresh data (e.g. after router.invalidate()).
  useEffect(() => {
    setItems(initial.items);
    setNextCursor(initial.nextCursor);
    setUnread(initial.unreadCount);
  }, [initial]);

  const refresh = useCallback(async () => {
    try {
      const page = await getMyNotificationsFn({ data: {} });
      setItems((prev) => {
        const fresh = new Set(page.items.map((i) => i.id));
        const oldest = page.items[page.items.length - 1]?.createdAt;
        const older = prev.filter((i) => !fresh.has(i.id) && (!oldest || i.createdAt <= oldest));
        return [...page.items, ...older];
      });
      setUnread(page.unreadCount);
    } catch {
      // Polling failures are silent; the next tick retries.
    }
  }, []);

  usePollingRefresh(() => void refresh(), 30_000);

  async function markOne(item: NotificationDto) {
    setError("");
    const result = await markNotificationReadFn({ data: { notificationId: item.id } });
    if (!result.success) {
      setError(result.error);
      return false;
    }
    setItems((prev) => prev.map((n) => (n.id === item.id ? result.data : n)));
    if (!item.read) setUnread((n) => Math.max(0, n - 1));
    requestCommRefresh();
    return true;
  }

  async function markAll() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await markAllNotificationsReadFn();
      if (!result.success) {
        setError(result.error);
        return;
      }
      setItems((prev) =>
        prev.map((n) => ({ ...n, read: true, readAt: n.readAt ?? new Date().toISOString() })),
      );
      setUnread(0);
      requestCommRefresh();
    } finally {
      setBusy(false);
    }
  }

  async function open(item: NotificationDto) {
    if (!item.read) await markOne(item);
    // Only a validated INTERNAL path is ever followed (open-redirect guard).
    if (isSafeInternalPath(item.link)) router.history.push(item.link);
  }

  async function loadMore() {
    if (!nextCursor || busy) return;
    setBusy(true);
    setError("");
    try {
      const page = await getMyNotificationsFn({ data: { cursor: nextCursor } });
      setItems((prev) => {
        const have = new Set(prev.map((i) => i.id));
        return [...prev, ...page.items.filter((i) => !have.has(i.id))];
      });
      setNextCursor(page.nextCursor);
      setUnread(page.unreadCount);
    } catch {
      setError("Couldn't load more notifications.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="text-cream">{unread}</span> unread
        </p>
        {unread > 0 && (
          <Button variant="outline" size="sm" onClick={markAll} disabled={busy}>
            Mark all as read
          </Button>
        )}
      </div>
      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
      {items.length === 0 ? (
        <EmptyState
          title="No notifications"
          description="Payments, course updates, payouts and replies will show up here."
        />
      ) : (
        <Card className="divide-y divide-line">
          {items.map((i) => (
            <NotificationItem
              key={i.id}
              item={i}
              onOpen={(n) => void open(n)}
              onRead={(n) => void markOne(n)}
            />
          ))}
        </Card>
      )}
      {nextCursor && (
        <div className="mt-4 text-center">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={busy}>
            {busy ? "Loading…" : "Load older notifications"}
          </Button>
        </div>
      )}
    </div>
  );
}
