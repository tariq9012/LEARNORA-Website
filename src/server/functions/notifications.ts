import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { ForbiddenError, UnauthorizedError, requireCurrentUser } from "../auth/guards";
import { InvalidCursorError } from "../lib/cursor";
import {
  NotificationNotFoundError,
  getMyNotifications,
  getUnreadCounts,
  markAllNotificationsRead,
  markNotificationRead,
} from "../services/notification-service";
import { listNotificationsSchema, notificationIdSchema } from "../validation/communication";
import type { NotificationDto, NotificationPageDto, UnreadCountsDto } from "../dto/communication";

/**
 * Notification server functions (Phase 11). Identity comes ONLY from the
 * session (requireCurrentUser): none of these accepts a userId, and the
 * strict schemas reject one if a client tries to smuggle it in. They are
 * createServerFn handlers, so the framework's CSRF protection covers the
 * two mutations.
 */

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

function toActionError(error: unknown): { success: false; error: string } {
  if (error instanceof z.ZodError)
    return { success: false, error: error.issues[0]?.message ?? "Invalid input." };
  if (error instanceof UnauthorizedError)
    return { success: false, error: "Please log in to continue." };
  if (error instanceof ForbiddenError)
    return { success: false, error: "You don't have permission to do that." };
  if (error instanceof NotificationNotFoundError) return { success: false, error: error.message };
  if (error instanceof InvalidCursorError) return { success: false, error: error.message };
  console.error("[notifications] unexpected error", error);
  return { success: false, error: "Something went wrong. Please try again." };
}

/** The signed-in user's own notifications, newest first, cursor-paginated (max 50 per page). */
export const getMyNotificationsFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => listNotificationsSchema.parse(data ?? {}))
  .handler(async ({ data }): Promise<NotificationPageDto> => {
    const user = await requireCurrentUser();
    return getMyNotifications(user, data);
  });

/**
 * Header/sidebar badge numbers (unread notifications + unread messages) in
 * one round trip. Serves as the "unread notification count" endpoint.
 */
export const getUnreadCountsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<UnreadCountsDto> => {
    const user = await requireCurrentUser();
    return getUnreadCounts(user);
  },
);

export const markNotificationReadFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => notificationIdSchema.parse(data))
  .handler(async ({ data }): Promise<ActionResult<NotificationDto>> => {
    try {
      const user = await requireCurrentUser();
      return { success: true, data: await markNotificationRead(user, data.notificationId) };
    } catch (error) {
      return toActionError(error);
    }
  });

export const markAllNotificationsReadFn = createServerFn({ method: "POST" }).handler(
  async (): Promise<ActionResult<{ updated: number }>> => {
    try {
      const user = await requireCurrentUser();
      return { success: true, data: await markAllNotificationsRead(user) };
    } catch (error) {
      return toActionError(error);
    }
  },
);
