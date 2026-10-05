import { prisma } from "../db/client";

export function createPasswordResetToken(data: {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}) {
  return prisma.passwordResetToken.create({ data });
}

export function findValidPasswordResetTokenByHash(tokenHash: string) {
  return prisma.passwordResetToken.findFirst({
    where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
  });
}

export function markPasswordResetTokenUsed(id: string) {
  return prisma.passwordResetToken.update({ where: { id }, data: { usedAt: new Date() } });
}

/**
 * Atomically claims a still-valid token (unused AND unexpired) in one UPDATE.
 * Returns the row count: exactly 1 for the single winner, 0 for every
 * concurrent/replayed request. This is what makes the token truly one-time.
 */
export function claimPasswordResetToken(id: string) {
  return prisma.passwordResetToken.updateMany({
    where: { id, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
}
