import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { ForbiddenError, UnauthorizedError, requireAnyRole } from "../auth/guards";
import { RateLimitExceededError } from "../auth/rate-limit";
import { InvalidCursorError } from "../lib/cursor";
import {
  MessagingError,
  getConversationMessages,
  getMyConversations,
  getOrCreateCourseConversation,
  markConversationRead,
  sendMessage,
} from "../services/messaging-service";
import {
  conversationMessagesSchema,
  courseSlugSchema,
  listConversationsSchema,
  markConversationReadSchema,
  sendMessageSchema,
} from "../validation/communication";
import type {
  ConversationDetailDto,
  ConversationListDto,
  ConversationSummaryDto,
  MessageDto,
} from "../dto/communication";

/**
 * Messaging server functions (Phase 11). Every one starts with
 * requireAnyRole(["STUDENT","INSTRUCTOR"]) — an ADMIN is refused outright —
 * and the service then requires ConversationParticipant membership for any
 * existing conversation. Nothing accepts a senderId / userId / participant
 * id; the strict schemas reject them. createServerFn keeps the framework's
 * CSRF protection on the mutations.
 */

const MESSAGING_ROLES = ["STUDENT", "INSTRUCTOR"] as const;

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

function toActionError(error: unknown): { success: false; error: string } {
  if (error instanceof z.ZodError)
    return { success: false, error: error.issues[0]?.message ?? "Invalid input." };
  if (error instanceof UnauthorizedError)
    return { success: false, error: "Please log in to continue." };
  if (error instanceof ForbiddenError)
    return { success: false, error: "Messaging isn't available for your account." };
  if (error instanceof RateLimitExceededError) {
    return { success: false, error: "You're sending messages too quickly. Please wait a moment." };
  }
  if (error instanceof MessagingError) return { success: false, error: error.message };
  if (error instanceof InvalidCursorError) return { success: false, error: error.message };
  console.error("[messaging] unexpected error", error);
  return { success: false, error: "Something went wrong. Please try again." };
}

export const getMyConversationsFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => listConversationsSchema.parse(data ?? {}))
  .handler(async ({ data }): Promise<ConversationListDto> => {
    const user = await requireAnyRole(MESSAGING_ROLES);
    return getMyConversations(user, data);
  });

/** Opens (or creates) the thread with the instructor of a course the student is currently entitled to. */
export const getOrCreateCourseConversationFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => courseSlugSchema.parse(data))
  .handler(async ({ data }): Promise<ActionResult<ConversationSummaryDto>> => {
    try {
      const user = await requireAnyRole(MESSAGING_ROLES);
      return { success: true, data: await getOrCreateCourseConversation(user, data.courseSlug) };
    } catch (error) {
      return toActionError(error);
    }
  });

/** One page of messages (newest page first; `cursor` walks back to older ones). Participants only; side-effect free. */
export const getConversationMessagesFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => conversationMessagesSchema.parse(data))
  .handler(async ({ data }): Promise<ActionResult<ConversationDetailDto>> => {
    try {
      const user = await requireAnyRole(MESSAGING_ROLES);
      return { success: true, data: await getConversationMessages(user, data) };
    } catch (error) {
      return toActionError(error);
    }
  });

export const sendMessageFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => sendMessageSchema.parse(data))
  .handler(async ({ data }): Promise<ActionResult<MessageDto>> => {
    try {
      const user = await requireAnyRole(MESSAGING_ROLES);
      return { success: true, data: await sendMessage(user, data) };
    } catch (error) {
      return toActionError(error);
    }
  });

export const markConversationReadFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => markConversationReadSchema.parse(data))
  .handler(async ({ data }): Promise<ActionResult<{ unreadMessages: number }>> => {
    try {
      const user = await requireAnyRole(MESSAGING_ROLES);
      return { success: true, data: await markConversationRead(user, data) };
    } catch (error) {
      return toActionError(error);
    }
  });
