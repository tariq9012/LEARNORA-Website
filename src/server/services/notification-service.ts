import { prisma } from "../db/client";
import { sanitizeInternalPath } from "../../lib/safe-path";
import * as preferenceRepository from "../repositories/notification-preference-repository";
import { publishCommEvent, type CommEventType } from "./realtime-service";
import { decodeCursor, encodeCursor } from "../lib/cursor";
import * as conversationRepository from "../repositories/conversation-repository";
import * as notificationRepository from "../repositories/notification-repository";
import type { NotificationType, Prisma } from "../../generated/prisma/client";
import type { SafeUser } from "../auth/types";
import type { NotificationDto, NotificationPageDto, UnreadCountsDto } from "../dto/communication";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const TITLE_MAX = 120;
const MESSAGE_MAX = 300;

export class NotificationNotFoundError extends Error {
  constructor() {
    super("Notification not found.");
    this.name = "NotificationNotFoundError";
  }
}

/**
 * Phase 12 preference categories. Matches NotificationPreference's boolean
 * columns exactly. `null`/omitted on NotifyInput means the notification is
 * ALWAYS created (SYSTEM/ANNOUNCEMENT — not user-suppressible); every
 * business event in notification-events.ts passes one of these explicitly,
 * which is what keeps preference enforcement centralized here rather than
 * scattered across payment/refund/message/course services.
 */
export type PreferenceCategory =
  "courseUpdates" | "payments" | "refunds" | "payouts" | "messages" | "certificates" | "moderation";

export type NotifyInput = {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  /** Internal app path or null. Anything else is dropped (open-redirect guard). */
  link?: string | null | undefined;
  /** Dedup key, unique per user (e.g. "refund:<refundId>"). Never derive it from the text. */
  eventKey?: string | null | undefined;
  /** Which preference gates this notification; omit/null for always-on (SYSTEM/ANNOUNCEMENT). */
  category?: PreferenceCategory | null | undefined;
};

/**
 * Whether `category` is enabled for `userId`. No row yet = the documented
 * default (all-enabled) without writing one — a row is created lazily only
 * when the user actually visits their notification settings or changes a
 * toggle (see notification-preference-service.ts). A DB error fails OPEN
 * (treats the category as enabled): a preferences outage must never silently
 * suppress a notification the user never chose to turn off.
 */
async function isCategoryEnabled(
  userId: string,
  category: PreferenceCategory | null | undefined,
): Promise<boolean> {
  if (!category) return true;
  try {
    const row = await preferenceRepository.findByUserId(userId);
    return row ? row[category] : true;
  } catch (error) {
    console.error("[notifications] preference lookup failed (failing open)", {
      category,
      error: error instanceof Error ? error.message : String(error),
    });
    return true;
  }
}

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

function clean(text: string, max: number): string {
  const stripped = text.replace(CONTROL_CHARS, "").trim();
  return stripped.length > max ? `${stripped.slice(0, max - 1)}…` : stripped;
}

function toRecord(input: NotifyInput) {
  return {
    userId: input.userId,
    type: input.type,
    title: clean(input.title, TITLE_MAX),
    message: clean(input.message, MESSAGE_MAX),
    // Only a validated internal path is ever stored.
    link: sanitizeInternalPath(input.link ?? null),
    eventKey: input.eventKey ?? null,
  };
}

/**
 * Creates a notification INSIDE a caller's transaction, so it commits or
 * rolls back together with whatever else that transaction does (used for
 * "message persisted + recipient notified"). May throw. Returns false if the
 * event was already notified (dedup), true if a row was created.
 */
export async function createNotificationInTx(
  tx: Prisma.TransactionClient,
  input: NotifyInput,
): Promise<boolean> {
  // The preference check reads through the OUTER connection (not `tx`) since
  // it is read-only and must see committed data; the transaction itself is
  // still the one that inserts the notification (or nothing) atomically with
  // the message it belongs to. SSE is published by the CALLER once its own
  // transaction has actually committed (see messaging-service.sendMessage) —
  // never from inside this still-open transaction.
  if (!(await isCategoryEnabled(input.userId, input.category))) return false;
  return notificationRepository.createIfAbsent(tx, toRecord(input));
}

/** notification_changed by default; a few types get a more specific hint the client already listens for. */
function eventForType(type: NotificationType): CommEventType {
  if (type === "REFUND") return "refund_changed";
  if (type === "PAYOUT") return "payout_changed";
  return "notification_changed";
}

/**
 * BEST-EFFORT notification, used AFTER a business transaction has already
 * committed (payment, refund, payout, moderation, completion, certificate).
 * It never throws: a notification problem must not turn a successful payment
 * or refund into an error, and there is deliberately no way for it to roll
 * anything back — finance correctness never depends on notification delivery.
 * Duplicate events are absorbed by the (userId, eventKey) unique key.
 */
export async function notify(input: NotifyInput): Promise<boolean> {
  try {
    if (!(await isCategoryEnabled(input.userId, input.category))) return false;
    const created = await notificationRepository.createIfAbsent(prisma, toRecord(input));
    // Best-effort UI hint only — published AFTER the row is committed, and a
    // failure here never affects the notification that was just saved.
    if (created) publishCommEvent(input.userId, eventForType(input.type));
    return created;
  } catch (error) {
    console.error("[notifications] failed to create notification (ignored)", {
      type: input.type,
      eventKey: input.eventKey ?? null,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

function toDto(row: {
  id: string;
  type: NotificationDto["type"];
  title: string;
  message: string;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
}): NotificationDto {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    // Re-validated on the way out too, in case a bad row ever exists.
    link: sanitizeInternalPath(row.link),
    read: row.readAt !== null,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** The signed-in user's own notifications, newest first, keyset-paginated (max 50 per page). */
export async function getMyNotifications(
  user: SafeUser,
  options: {
    cursor?: string | undefined;
    limit?: number | undefined;
    unreadOnly?: boolean | undefined;
  } = {},
): Promise<NotificationPageDto> {
  const take = Math.min(options.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const cursor = options.cursor ? decodeCursor(options.cursor) : null;

  const [rows, unreadCount] = await Promise.all([
    notificationRepository.listForUser(user.id, {
      cursor,
      take: take + 1,
      unreadOnly: options.unreadOnly ?? false,
    }),
    notificationRepository.countUnread(user.id),
  ]);

  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;
  const last = page[page.length - 1];
  return {
    items: page.map(toDto),
    nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
    unreadCount,
  };
}

/** Header/sidebar badges: unread notifications + unread messages, two cheap indexed queries. */
export async function getUnreadCounts(user: SafeUser): Promise<UnreadCountsDto> {
  const [notifications, messages] = await Promise.all([
    notificationRepository.countUnread(user.id),
    // Admins have no messaging access, so they never have a message count.
    user.role === "ADMIN" ? Promise.resolve(0) : conversationRepository.countUnreadTotal(user.id),
  ]);
  return { notifications, messages };
}

/**
 * Marks ONE notification read. Ownership is enforced by the query itself
 * (WHERE id AND userId): someone else's notification is indistinguishable
 * from a nonexistent one. Marking an already-read one is a harmless no-op.
 */
export async function markNotificationRead(
  user: SafeUser,
  notificationId: string,
): Promise<NotificationDto> {
  const owned = await notificationRepository.findOwned(user.id, notificationId);
  if (!owned) throw new NotificationNotFoundError();
  if (!owned.readAt) {
    await notificationRepository.markRead(user.id, notificationId);
    publishCommEvent(user.id, "notification_changed");
  }
  const fresh = await notificationRepository.findOwned(user.id, notificationId);
  if (!fresh) throw new NotificationNotFoundError();
  return toDto(fresh);
}

export async function markAllNotificationsRead(user: SafeUser): Promise<{ updated: number }> {
  const result = await notificationRepository.markAllRead(user.id);
  if (result.count > 0) publishCommEvent(user.id, "notification_changed");
  return { updated: result.count };
}
