import { prisma } from "../db/client";
import { olderThan, type DecodedCursor } from "../lib/cursor";
import type { NotificationType, Prisma } from "../../generated/prisma/client";

/**
 * Persistence for Notification (Phase 11). Every read/mutation takes the
 * OWNER's userId explicitly — the service passes the session user's id, so
 * there is no code path that can touch another user's notification. No
 * business-event decisions live here (see notification-events.ts).
 */

type DbClient = Prisma.TransactionClient | typeof prisma;

export type NewNotification = {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link: string | null;
  eventKey: string | null;
};

/**
 * Inserts one notification, silently doing nothing if (userId, eventKey)
 * already exists (INSERT … ON CONFLICT DO NOTHING). That matters for two
 * reasons: retries of a business event never spam, and — unlike catching a
 * unique-violation error — a duplicate never aborts an enclosing Postgres
 * transaction. Returns true only if a row was actually created.
 */
export async function createIfAbsent(client: DbClient, data: NewNotification): Promise<boolean> {
  const result = await client.notification.createMany({ data: [data], skipDuplicates: true });
  return result.count === 1;
}

const LIST_SELECT = {
  id: true,
  type: true,
  title: true,
  message: true,
  link: true,
  readAt: true,
  createdAt: true,
} as const;

export function listForUser(
  userId: string,
  options: { cursor: DecodedCursor | null; take: number; unreadOnly: boolean },
) {
  return prisma.notification.findMany({
    where: {
      userId,
      ...(options.unreadOnly && { readAt: null }),
      ...(options.cursor && olderThan(options.cursor)),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: options.take,
    select: LIST_SELECT,
  });
}

export function countUnread(userId: string) {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

/** Scoped lookup: returns null for "doesn't exist" AND "belongs to someone else" alike. */
export function findOwned(userId: string, notificationId: string) {
  return prisma.notification.findFirst({
    where: { id: notificationId, userId },
    select: LIST_SELECT,
  });
}

/** Conditional: only flips an unread row that belongs to `userId`. Count 0 = already read or not theirs. */
export function markRead(userId: string, notificationId: string) {
  return prisma.notification.updateMany({
    where: { id: notificationId, userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export function markAllRead(userId: string) {
  return prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}

/** Marks a user's unread NEW_MESSAGE notifications for one conversation (identified by its link) as read. */
export function markMessageNotificationsRead(userId: string, link: string) {
  return prisma.notification.updateMany({
    where: { userId, type: "NEW_MESSAGE", link, readAt: null },
    data: { readAt: new Date() },
  });
}

/** Optional housekeeping: removes READ notifications older than `before`. Not scheduled anywhere in Phase 11. */
export function deleteReadOlderThan(before: Date) {
  return prisma.notification.deleteMany({
    where: { readAt: { not: null }, createdAt: { lt: before } },
  });
}
