import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { UnauthorizedError, requireCurrentUser } from "../auth/guards";
import {
  getMyNotificationPreferences,
  updateMyNotificationPreferences,
} from "../services/notification-preference-service";
import { updateNotificationPreferencesSchema } from "../validation/moderation";
import type { NotificationPreferencesDto } from "../dto/moderation";

/** Notification-preference server functions (Phase 12). Identity always from the session — never a client-supplied userId. */

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

function toActionError(error: unknown): { success: false; error: string } {
  if (error instanceof z.ZodError)
    return { success: false, error: error.issues[0]?.message ?? "Invalid input." };
  if (error instanceof UnauthorizedError)
    return { success: false, error: "Please log in to continue." };
  console.error("[notification-preferences] unexpected error", error);
  return { success: false, error: "Something went wrong. Please try again." };
}

export const getNotificationPreferencesFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<NotificationPreferencesDto> => {
    const user = await requireCurrentUser();
    return getMyNotificationPreferences(user);
  },
);

export const updateNotificationPreferencesFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => updateNotificationPreferencesSchema.parse(data))
  .handler(async ({ data }): Promise<ActionResult<NotificationPreferencesDto>> => {
    try {
      const user = await requireCurrentUser();
      return { success: true, data: await updateMyNotificationPreferences(user, data) };
    } catch (error) {
      return toActionError(error);
    }
  });
