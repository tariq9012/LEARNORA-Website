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
