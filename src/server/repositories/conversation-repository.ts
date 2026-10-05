import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../db/client";
import { olderThan, type DecodedCursor } from "../lib/cursor";

/**
 * Persistence for Conversation / ConversationParticipant / Message
 * (Phase 11). The participant check is the ONLY authorization primitive:
 * `findForParticipant` returns a conversation only if `userId` is one of its
 * participants — knowing a conversation id grants nothing.
 */

type DbClient = Prisma.TransactionClient | typeof prisma;

const CONVERSATION_INCLUDE = {
  course: { select: { id: true, title: true, slug: true, instructorId: true } },
  participants: {
    select: {
      userId: true,
      lastReadAt: true,
      user: { select: { id: true, name: true, role: true } },
    },
  },
} as const;

export type ConversationRow = Prisma.ConversationGetPayload<{
  include: typeof CONVERSATION_INCLUDE;
}>;

export function findCourseForMessaging(slug: string) {
  return prisma.course.findUnique({
    where: { slug },
    select: { id: true, title: true, slug: true, instructorId: true },
  });
}

export function findByCourseAndStudent(courseId: string, studentId: string) {
  return prisma.conversation.findUnique({
    where: { courseId_studentId: { courseId, studentId } },
    include: CONVERSATION_INCLUDE,
  });
}

/** Creates the thread and BOTH participants atomically. UNIQUE(courseId, studentId) rejects a concurrent duplicate (P2002). */
export function createCourseConversation(params: {
  courseId: string;
  studentId: string;
  instructorId: string;
}) {
  return prisma.conversation.create({
    data: {
      courseId: params.courseId,
      studentId: params.studentId,
      participants: { create: [{ userId: params.studentId }, { userId: params.instructorId }] },
    },
    include: CONVERSATION_INCLUDE,
  });
}

/** The authorization primitive: null unless `userId` participates in the conversation. */
export function findForParticipant(userId: string, conversationId: string) {
  return prisma.conversation.findFirst({
    where: { id: conversationId, participants: { some: { userId } } },
    include: CONVERSATION_INCLUDE,
  });
}

export function listForParticipant(userId: string, take: number) {
  return prisma.conversation.findMany({
    where: {
      participants: { some: { userId } },
      // A brand-new thread with no message yet is visible only to the student who opened it.
      OR: [{ lastMessageAt: { not: null } }, { studentId: userId }],
    },
    orderBy: [
      { lastMessageAt: { sort: "desc", nulls: "last" } },
      { createdAt: "desc" },
      { id: "desc" },
    ],
    take,
    include: CONVERSATION_INCLUDE,
  });
}

export type LastMessageRow = {
  conversationId: string;
  content: string;
  senderId: string;
  createdAt: Date;
  removedAt: Date | null;
};

/** Newest message for each of many conversations in ONE query (no N+1). */
export async function findLastMessages(conversationIds: string[]): Promise<LastMessageRow[]> {
  if (conversationIds.length === 0) return [];
  return prisma.$queryRaw<LastMessageRow[]>`
    SELECT DISTINCT ON (m."conversationId")
      m."conversationId", m."content", m."senderId", m."createdAt", m."removedAt"
    FROM "messages" m
    WHERE m."conversationId" IN (${Prisma.join(conversationIds)})
    ORDER BY m."conversationId", m."createdAt" DESC, m."id" DESC
  `;
}

/**
 * Unread messages per conversation for `userId`, in ONE grouped query:
 * messages sent by SOMEONE ELSE after this participant's lastReadAt. The
 * user's own messages never count towards their own unread number.
 */
export async function countUnreadByConversation(userId: string): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<{ conversationId: string; unread: number }[]>`
    SELECT m."conversationId", COUNT(*)::int AS unread
    FROM "messages" m
    JOIN "conversation_participants" p
      ON p."conversationId" = m."conversationId" AND p."userId" = ${userId}
    WHERE m."senderId" <> ${userId}
      AND (p."lastReadAt" IS NULL OR m."createdAt" > p."lastReadAt")
    GROUP BY m."conversationId"
  `;
  return new Map(rows.map((r) => [r.conversationId, r.unread]));
}

export async function countUnreadTotal(userId: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ unread: number }[]>`
    SELECT COUNT(*)::int AS unread
    FROM "messages" m
    JOIN "conversation_participants" p
      ON p."conversationId" = m."conversationId" AND p."userId" = ${userId}
    WHERE m."senderId" <> ${userId}
      AND (p."lastReadAt" IS NULL OR m."createdAt" > p."lastReadAt")
  `;
  return rows[0]?.unread ?? 0;
}

export function listMessages(
  conversationId: string,
  options: { cursor: DecodedCursor | null; take: number },
) {
  return prisma.message.findMany({
    where: { conversationId, ...(options.cursor && olderThan(options.cursor)) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: options.take,
    select: { id: true, senderId: true, content: true, createdAt: true, removedAt: true },
  });
}

export function findMessageByClientId(senderId: string, clientMessageId: string) {
  return prisma.message.findUnique({
    where: { senderId_clientMessageId: { senderId, clientMessageId } },
    select: {
      id: true,
      conversationId: true,
      senderId: true,
      content: true,
      createdAt: true,
      removedAt: true,
    },
  });
}

export function findMessageInConversation(conversationId: string, messageId: string) {
  return prisma.message.findFirst({
    where: { id: messageId, conversationId },
    select: { id: true, createdAt: true },
  });
}

export function createMessageInTx(
  tx: DbClient,
  data: { conversationId: string; senderId: string; content: string; clientMessageId: string },
) {
  return tx.message.create({
    data,
    select: {
      id: true,
      conversationId: true,
      senderId: true,
      content: true,
      createdAt: true,
      removedAt: true,
    },
  });
}

/** Moves lastMessageAt forward only (never backwards), inside the send transaction. */
export function touchLastMessageInTx(tx: DbClient, conversationId: string, at: Date) {
  return tx.conversation.updateMany({
    where: { id: conversationId, OR: [{ lastMessageAt: null }, { lastMessageAt: { lt: at } }] },
    data: { lastMessageAt: at },
  });
}

/** Advances (never rewinds) THIS participant's read marker. Someone else's marker is unreachable: userId is part of the WHERE. */
export function advanceLastRead(conversationId: string, userId: string, upTo: Date) {
  return prisma.conversationParticipant.updateMany({
    where: {
      conversationId,
      userId,
      OR: [{ lastReadAt: null }, { lastReadAt: { lt: upTo } }],
    },
    data: { lastReadAt: upTo },
  });
}

// ---------------------------------------------------------------------------
// Phase 12 — moderation support
// ---------------------------------------------------------------------------

/** Everything report-service needs to validate + snapshot a reported message, in one query. */
export function findMessageForReport(messageId: string) {
  return prisma.message.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      conversationId: true,
      senderId: true,
      content: true,
      createdAt: true,
      removedAt: true,
      sender: { select: { name: true, role: true } },
      conversation: {
        select: {
          participants: { select: { userId: true } },
          course: { select: { title: true } },
        },
      },
    },
  });
}

/** Moderation tombstone: the row and its `content` are kept; only `removedAt` is set. Conditional so it can't be "un-set" by this call. */
export function markMessageRemoved(messageId: string) {
  return prisma.message.updateMany({
    where: { id: messageId, removedAt: null },
    data: { removedAt: new Date() },
  });
}
