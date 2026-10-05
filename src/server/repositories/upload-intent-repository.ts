import { prisma } from "../db/client";
import type { MediaPurpose } from "../media/media-config";

/** Phase 18: persistence for direct-to-R2 upload intents. See schema.prisma (UploadIntent). */

export function createUploadIntent(data: {
  userId: string;
  purpose: MediaPurpose;
  courseId: string | null;
  lessonId: string | null;
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  expectedSize: number;
  resourceTitle: string | null;
  expiresAt: Date;
}) {
  return prisma.uploadIntent.create({ data });
}

/** Scoped to the owner: another user's intent id behaves exactly like a missing one. */
export function findUploadIntentForUser(intentId: string, userId: string) {
  return prisma.uploadIntent.findFirst({ where: { id: intentId, userId } });
}

/** Unfinalized, unexpired intents — used to cap how many a single user can hold open. */
export function countOpenIntentsForUser(userId: string, now: Date) {
  return prisma.uploadIntent.count({
    where: { userId, finalizedAt: null, expiresAt: { gt: now } },
  });
}

/** Intents that were never finalized and whose finalize window (+ grace) has long passed. */
export function findAbandonedIntents(cutoff: Date, limit: number) {
  return prisma.uploadIntent.findMany({
    where: { finalizedAt: null, expiresAt: { lt: cutoff } },
    orderBy: { expiresAt: "asc" },
    take: limit,
    select: { id: true, storageKey: true, purpose: true, expiresAt: true },
  });
}

export function deleteUploadIntent(intentId: string) {
  // `finalizedAt: null` guard: never remove the record of a finalized upload.
  return prisma.uploadIntent.deleteMany({ where: { id: intentId, finalizedAt: null } });
}
