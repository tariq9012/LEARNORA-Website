import { prisma } from "../db/client";
import type { Prisma } from "../../generated/prisma/client";

/** Persistence for NotificationPreference (Phase 12). One row per user, created lazily with all-enabled defaults. */

export function findByUserId(userId: string) {
  return prisma.notificationPreference.findUnique({ where: { userId } });
}

/** Creates the default (all-enabled) row if it doesn't exist yet — safe to call concurrently (P2002 on the loser, handled by the caller). */
export function createDefault(userId: string) {
  return prisma.notificationPreference.create({ data: { userId } });
}

export function update(userId: string, data: Prisma.NotificationPreferenceUpdateInput) {
  return prisma.notificationPreference.update({ where: { userId }, data });
}

/** Used by notification-service's enforcement check — a lean single-column read, not the full row. */
export function findCategoryValue(
  userId: string,
  category: keyof Prisma.NotificationPreferenceSelect,
) {
  return prisma.notificationPreference.findUnique({
    where: { userId },
    select: { [category]: true } as never,
  });
}
