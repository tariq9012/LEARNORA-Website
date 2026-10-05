import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../db/client";
import { ForbiddenError } from "../auth/guards";
import { enforceRateLimit } from "../auth/rate-limit";
import { decodeCursor, encodeCursor } from "../lib/cursor";
import * as conversationRepository from "../repositories/conversation-repository";
import * as enrollmentRepository from "../repositories/enrollment-repository";
import * as notificationRepository from "../repositories/notification-repository";
import { sendMessageSchema } from "../validation/communication";
import { isEnrollmentEntitled } from "./enrollment-policy";
import { createNotificationInTx } from "./notification-service";
import { publishCommEvent } from "./realtime-service";
import type { SafeUser } from "../auth/types";
import type {
  ConversationDetailDto,
  ConversationListDto,
  ConversationSummaryDto,
  MessageDto,
} from "../dto/communication";

/**
 * Student <-> instructor, course-related, plain-text messaging (Phase 11).
 *
 * AUTHORIZATION POLICY
 *  - Only STUDENTs and INSTRUCTORs use messaging. An ADMIN can never read or
 *    write conversations — being an admin grants nothing here; the only door
 *    is ConversationParticipant membership.
 *  - Starting a thread: a STUDENT, and only with the instructor of a course
 *    they CURRENTLY hold an entitlement to (ACTIVE or COMPLETED — the same
 *    Phase 7 policy as course access). A CANCELLED (e.g. refunded)
 *    enrollment cannot start one.
 *  - Reading: any participant, always (history stays readable).
 *  - Sending: a participant. A student additionally needs a current
 *    entitlement to that course (re-checked on every send, so a refund ends
 *    their ability to message); the instructor may always reply.
 *  - Every operation on an existing conversation starts from
 *    findForParticipant(userId, conversationId); "not a participant" is
 *    reported exactly like "doesn't exist" (no id probing).
 *  - Instructors cannot start threads with arbitrary students (no cold DMs).
 */

export type MessagingErrorCode =
  "NOT_FOUND" | "NOT_ENTITLED" | "COURSE_NOT_FOUND" | "INVALID" | "FORBIDDEN_ROLE";

export class MessagingError extends Error {
  readonly code: MessagingErrorCode;
  constructor(code: MessagingErrorCode, message: string) {
    super(message);
    this.name = "MessagingError";
    this.code = code;
  }
}

const notFound = () => new MessagingError("NOT_FOUND", "Conversation not found.");

const DEFAULT_LIST = 30;
const MAX_LIST = 50;
const DEFAULT_HISTORY = 30;
const MAX_HISTORY = 50;
const PREVIEW_LENGTH = 90;
const REMOVED_PLACEHOLDER = "Message removed by moderation.";

/** Send limit per user (in-memory limiter — see auth/rate-limit.ts for its single-instance caveat). */
export const MESSAGE_RATE_LIMIT = { limit: 30, windowMs: 60_000 } as const;
const CONVERSATION_RATE_LIMIT = { limit: 20, windowMs: 60_000 } as const;

function assertMessagingRole(user: SafeUser) {
  if (user.role !== "STUDENT" && user.role !== "INSTRUCTOR") {
    throw new ForbiddenError("Messaging is only available to students and instructors.");
  }
}

function conversationLink(role: SafeUser["role"], conversationId: string): string {
  return `${role === "INSTRUCTOR" ? "/instructor/messages" : "/student/messages"}?c=${conversationId}`;
}

async function studentIsEntitled(studentId: string, courseId: string | null): Promise<boolean> {
  if (!courseId) return false;
  const enrollment = await enrollmentRepository.findEnrollment(studentId, courseId);
  return !!enrollment && isEnrollmentEntitled(enrollment.status);
}

function preview(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > PREVIEW_LENGTH ? `${oneLine.slice(0, PREVIEW_LENGTH - 1)}…` : oneLine;
}

/** Phase 12 moderation tombstone: every participant sees the placeholder, never the original text, once removed. */
function displayContent<T extends { content: string; removedAt?: Date | null }>(row: T): string {
  return row.removedAt ? REMOVED_PLACEHOLDER : row.content;
}

type SummaryExtras = {
  lastMessage?:
    { content: string; senderId: string; createdAt: Date; removedAt?: Date | null } | undefined;
  unread: number;
  canSend: boolean;
};

function toSummary(
  viewerId: string,
  row: conversationRepository.ConversationRow,
  extras: SummaryExtras,
): ConversationSummaryDto {
  const other = row.participants.find((p) => p.userId !== viewerId)?.user;
  return {
    id: row.id,
    courseTitle: row.course?.title ?? null,
    courseSlug: row.course?.slug ?? null,
    otherName: other?.name ?? "Unknown",
    otherRole: other?.role ?? "STUDENT",
    lastMessagePreview: extras.lastMessage ? preview(displayContent(extras.lastMessage)) : null,
    lastMessageAt: (extras.lastMessage?.createdAt ?? row.lastMessageAt)?.toISOString() ?? null,
    lastMessageFromMe: extras.lastMessage?.senderId === viewerId,
    unreadCount: extras.unread,
    canSend: extras.canSend,
  };
}

/** Whether `viewer` may currently send in this conversation (students need a live entitlement). */
async function canSendIn(
  viewer: SafeUser,
  row: conversationRepository.ConversationRow,
): Promise<boolean> {
  if (viewer.role === "INSTRUCTOR") return true;
  return studentIsEntitled(viewer.id, row.courseId);
}

// ---------------------------------------------------------------------------
// Start / find a conversation
// ---------------------------------------------------------------------------

/**
 * Get-or-create the thread between the signed-in STUDENT and the instructor
 * of `courseSlug`. The server derives the instructor from the course — the
 * client never names a participant. Concurrent calls converge on ONE row via
 * UNIQUE(courseId, studentId): the loser of the race catches the unique
 * violation and returns the winner's conversation.
 */
export async function getOrCreateCourseConversation(
  user: SafeUser,
  courseSlug: string,
): Promise<ConversationSummaryDto> {
  if (user.role !== "STUDENT") {
    throw new MessagingError(
      "FORBIDDEN_ROLE",
      "Only students can start a conversation with an instructor.",
    );
  }
  enforceRateLimit(
    `conv:${user.id}`,
    CONVERSATION_RATE_LIMIT.limit,
    CONVERSATION_RATE_LIMIT.windowMs,
  );

  const course = await conversationRepository.findCourseForMessaging(courseSlug);
  if (!course) throw new MessagingError("COURSE_NOT_FOUND", "Course not found.");

  // The gate: a CURRENT entitlement (ACTIVE / COMPLETED) to THIS course.
  if (!(await studentIsEntitled(user.id, course.id))) {
    throw new MessagingError(
      "NOT_ENTITLED",
      "You can message an instructor only while you have access to their course.",
    );
  }

  let row = await conversationRepository.findByCourseAndStudent(course.id, user.id);
  if (!row) {
    try {
      row = await conversationRepository.createCourseConversation({
        courseId: course.id,
        studentId: user.id,
        instructorId: course.instructorId,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        row = await conversationRepository.findByCourseAndStudent(course.id, user.id);
      } else {
        throw error;
      }
    }
  }
  if (!row) throw notFound();

  const unread = (await conversationRepository.countUnreadByConversation(user.id)).get(row.id) ?? 0;
  return toSummary(user.id, row, { unread, canSend: true });
}

// ---------------------------------------------------------------------------
// Inbox
// ---------------------------------------------------------------------------

/** The signed-in user's conversations, most recent activity first. 3 queries total regardless of size. */
export async function getMyConversations(
  user: SafeUser,
  options: { limit?: number | undefined } = {},
): Promise<ConversationListDto> {
  assertMessagingRole(user);
  const take = Math.min(options.limit ?? DEFAULT_LIST, MAX_LIST);

  const rows = await conversationRepository.listForParticipant(user.id, take + 1);
  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;

  const [lastMessages, unreadMap] = await Promise.all([
    conversationRepository.findLastMessages(page.map((r) => r.id)),
    conversationRepository.countUnreadByConversation(user.id),
  ]);
  const lastById = new Map(lastMessages.map((m) => [m.conversationId, m]));

  // For a student, "can I send here" needs their entitlement per course — one
  // batched read of their enrollments, not one query per conversation.
  let entitledCourseIds = new Set<string>();
  if (user.role === "STUDENT") {
    const enrollments = await enrollmentRepository.listEnrollmentsWithCourseForUser(user.id);
    entitledCourseIds = new Set(enrollments.map((e) => e.courseId));
  }

  return {
    conversations: page.map((row) =>
      toSummary(user.id, row, {
        lastMessage: lastById.get(row.id),
        unread: unreadMap.get(row.id) ?? 0,
        canSend:
          user.role === "INSTRUCTOR" ? true : !!row.courseId && entitledCourseIds.has(row.courseId),
      }),
    ),
    hasMore,
  };
}

// ---------------------------------------------------------------------------
// One conversation
// ---------------------------------------------------------------------------

function toMessageDto(
  viewerId: string,
  row: conversationRepository.ConversationRow,
  message: {
    id: string;
    senderId: string;
    content: string;
    createdAt: Date;
    removedAt?: Date | null;
    conversationId?: string;
  },
): MessageDto {
  const sender = row.participants.find((p) => p.userId === message.senderId)?.user;
  return {
    id: message.id,
    conversationId: row.id,
    mine: message.senderId === viewerId,
    senderName: sender?.name ?? "Unknown",
    content: displayContent(message),
    createdAt: message.createdAt.toISOString(),
  };
}

/**
 * One page of a conversation's history (newest page by default; pass the
 * returned `nextCursor` for OLDER messages). Participants only. Reading does
 * NOT mark anything read — that is the explicit markConversationRead call, so
 * GETs stay side-effect free.
 */
export async function getConversationMessages(
  user: SafeUser,
  input: { conversationId: string; cursor?: string | undefined; limit?: number | undefined },
): Promise<ConversationDetailDto> {
  assertMessagingRole(user);
  const row = await conversationRepository.findForParticipant(user.id, input.conversationId);
  if (!row) throw notFound();

  const take = Math.min(input.limit ?? DEFAULT_HISTORY, MAX_HISTORY);
  const cursor = input.cursor ? decodeCursor(input.cursor) : null;
  const rows = await conversationRepository.listMessages(row.id, { cursor, take: take + 1 });
  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;
  const oldest = page[page.length - 1];

  const [unreadMap, canSend, lastMessages] = await Promise.all([
    conversationRepository.countUnreadByConversation(user.id),
    canSendIn(user, row),
    conversationRepository.findLastMessages([row.id]),
  ]);

  return {
    conversation: toSummary(user.id, row, {
      lastMessage: lastMessages[0],
      unread: unreadMap.get(row.id) ?? 0,
      canSend,
    }),
    messages: [...page].reverse().map((m) => toMessageDto(user.id, row, m)),
    nextCursor: hasMore && oldest ? encodeCursor(oldest.createdAt, oldest.id) : null,
  };
}

// ---------------------------------------------------------------------------
// Send
// ---------------------------------------------------------------------------

/**
 * Sends a plain-text message as the SESSION user (never a client-supplied
 * sender). Order of checks: role -> rate limit -> participant -> (student)
 * live entitlement -> idempotency -> one transaction.
 *
 * IDEMPOTENCY: the browser sends a fresh `clientMessageId` for each composed
 * message and re-sends the SAME one when retrying. UNIQUE(senderId,
 * clientMessageId) makes a duplicate insert impossible; a retry (or a
 * double-click that fires the request twice) returns the ORIGINAL message and
 * creates no second row and no second notification. Two messages the user
 * genuinely submits separately carry different ids, so both are delivered —
 * even if the text is identical.
 *
 * TRANSACTION: the message row, the conversation's lastMessageAt bump and the
 * recipient's NEW_MESSAGE notification commit together, so nobody is ever
 * notified about a message that failed to save (and a saved message can't
 * lack its notification). The notification is deduplicated by
 * eventKey "message:<messageId>".
 */
export async function sendMessage(user: SafeUser, input: unknown): Promise<MessageDto> {
  assertMessagingRole(user);
  // Re-validated here so the service is safe even if called without the server-function validator.
  const data = sendMessageSchema.parse(input);
  enforceRateLimit(`msg:${user.id}`, MESSAGE_RATE_LIMIT.limit, MESSAGE_RATE_LIMIT.windowMs);

  const row = await conversationRepository.findForParticipant(user.id, data.conversationId);
  if (!row) throw notFound();

  const replay = await findReplay(user.id, row, data.clientMessageId);
  if (replay) return replay;

  if (user.role === "STUDENT" && !(await studentIsEntitled(user.id, row.courseId))) {
    throw new MessagingError(
      "NOT_ENTITLED",
      "You no longer have access to this course, so you can't send new messages in this conversation.",
    );
  }

  const recipient = row.participants.find((p) => p.userId !== user.id);
  if (!recipient)
    throw new MessagingError("INVALID", "This conversation has no other participant.");

  try {
    const message = await prisma.$transaction(async (tx) => {
      const created = await conversationRepository.createMessageInTx(tx, {
        conversationId: row.id,
        senderId: user.id,
        content: data.content,
        clientMessageId: data.clientMessageId,
      });
      await conversationRepository.touchLastMessageInTx(tx, row.id, created.createdAt);
      await createNotificationInTx(tx, {
        userId: recipient.userId,
        type: "NEW_MESSAGE",
        category: "messages",
        title: `New message from ${user.name}`,
        // Deliberately NOT the message text: previews of private content stay out of the notification table.
        message: row.course ? `About “${row.course.title}”.` : "Open your inbox to read it.",
        link: conversationLink(recipient.user.role, row.id),
        eventKey: `message:${created.id}`,
      });
      return created;
    });
    // Best-effort SSE hint to BOTH participants, published only after the
    // send transaction has committed — never a substitute for it, and a
    // dropped/absent connection never affects the saved message.
    publishCommEvent([user.id, recipient.userId], "message_changed");
    return toMessageDto(user.id, row, message);
  } catch (error) {
    // Lost a race with an identical retry: the winner's message is THE message.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const replayed = await findReplay(user.id, row, data.clientMessageId);
      if (replayed) return replayed;
    }
    throw error;
  }
}

async function findReplay(
  userId: string,
  row: conversationRepository.ConversationRow,
  clientMessageId: string,
): Promise<MessageDto | null> {
  const existing = await conversationRepository.findMessageByClientId(userId, clientMessageId);
  if (!existing) return null;
  // The same key must not be reusable to write into a DIFFERENT conversation.
  if (existing.conversationId !== row.id) {
    throw new MessagingError(
      "INVALID",
      "This message id was already used for another conversation.",
    );
  }
  return toMessageDto(userId, row, existing);
}

// ---------------------------------------------------------------------------
// Read state
// ---------------------------------------------------------------------------

/**
 * Marks the conversation read FOR THE SIGNED-IN USER ONLY: advances their own
 * ConversationParticipant.lastReadAt (never backwards, never someone else's —
 * userId is part of the WHERE). `upToMessageId` lets the UI say "up to the
 * newest message I actually displayed", so a message that arrived after the
 * page loaded stays unread. Also clears that conversation's NEW_MESSAGE
 * notifications so the two badges agree.
 */
export async function markConversationRead(
  user: SafeUser,
  input: { conversationId: string; upToMessageId?: string | undefined },
): Promise<{ unreadMessages: number }> {
  assertMessagingRole(user);
  const row = await conversationRepository.findForParticipant(user.id, input.conversationId);
  if (!row) throw notFound();

  let upTo = new Date();
  if (input.upToMessageId) {
    const message = await conversationRepository.findMessageInConversation(
      row.id,
      input.upToMessageId,
    );
    if (!message) throw new MessagingError("INVALID", "Message not found in this conversation.");
    upTo = message.createdAt;
  }

  await conversationRepository.advanceLastRead(row.id, user.id, upTo);
  await notificationRepository.markMessageNotificationsRead(
    user.id,
    conversationLink(user.role, row.id),
  );

  return { unreadMessages: await conversationRepository.countUnreadTotal(user.id) };
}
