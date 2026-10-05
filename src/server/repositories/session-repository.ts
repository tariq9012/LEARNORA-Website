import { prisma } from "../db/client";

export function createSession(data: {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  userAgent?: string;
  ipAddress?: string;
}) {
  return prisma.session.create({ data });
}

export function findValidSessionByTokenHash(tokenHash: string) {
  return prisma.session.findFirst({
    where: { tokenHash, expiresAt: { gt: new Date() } },
  });
}

export function touchSession(id: string) {
  return prisma.session.update({ where: { id }, data: { lastUsedAt: new Date() } }).catch(() => {
    // Best-effort — a session deleted concurrently (e.g. by a logout on
    // another tab) shouldn't turn into an unhandled rejection here.
  });
}

export function deleteSessionByTokenHash(tokenHash: string) {
  return prisma.session.deleteMany({ where: { tokenHash } });
}

export function deleteAllSessionsForUser(userId: string) {
  return prisma.session.deleteMany({ where: { userId } });
}

/** Opportunistic cleanup of expired sessions. Safe to call periodically. */
export function deleteExpiredSessions() {
  return prisma.session.deleteMany({ where: { expiresAt: { lte: new Date() } } });
}

/** Every non-expired session for a user, newest activity first. Never selects tokenHash. */
export function findSessionsForUser(userId: string) {
  return prisma.session.findMany({
    where: { userId, expiresAt: { gt: new Date() } },
    orderBy: [{ lastUsedAt: "desc" }, { createdAt: "desc" }],
    select: { id: true, createdAt: true, lastUsedAt: true, userAgent: true },
  });
}

/**
 * Deletes exactly one session, scoped to `userId` — this is the IDOR
 * guard: a sessionId that exists but belongs to another user matches
 * nothing and the result count is 0, never another user's row.
 */
export function deleteSessionForUser(userId: string, sessionId: string) {
  return prisma.session.deleteMany({ where: { id: sessionId, userId } });
}

/** Deletes every session for a user except the one given (or all of them, if `exceptSessionId` is null). */
export function deleteOtherSessionsForUser(userId: string, exceptSessionId: string | null) {
  return prisma.session.deleteMany({
    where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
  });
}
