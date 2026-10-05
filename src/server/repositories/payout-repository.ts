import { prisma } from "../db/client";
import type { Prisma } from "../../generated/prisma/client";

/**
 * Persistence for Payout (Phase 10). As with earnings, instructor-facing
 * reads take an `instructorId` derived from the session by the service;
 * admin reads are only reachable through admin-guarded server functions.
 */

export function listForInstructor(instructorId: string, take = 50) {
  return prisma.payout.findMany({
    where: { instructorId },
    orderBy: { requestedAt: "desc" },
    take,
  });
}

const ADMIN_PAYOUT_INCLUDE = {
  instructor: { select: { name: true, email: true } },
  processedBy: { select: { name: true } },
  _count: { select: { earnings: true } },
} as const;

export function listAll(take = 200) {
  return prisma.payout.findMany({
    include: ADMIN_PAYOUT_INCLUDE,
    orderBy: { requestedAt: "desc" },
    take,
  });
}

export function findByIdWithAdminInclude(payoutId: string) {
  return prisma.payout.findUnique({ where: { id: payoutId }, include: ADMIN_PAYOUT_INCLUDE });
}

/** Payouts still awaiting an admin decision (their earnings are locked). */
export function aggregateOpen() {
  return prisma.payout.aggregate({
    where: { status: { in: ["PENDING", "PROCESSING"] } },
    _sum: { amount: true },
    _count: { _all: true },
  });
}

export function aggregatePaid() {
  return prisma.payout.aggregate({
    where: { status: "PAID" },
    _sum: { amount: true },
  });
}

// ---------------------------------------------------------------------------
// Transactional building blocks
// ---------------------------------------------------------------------------

/**
 * Serialises payout requests per instructor: takes a row lock on the
 * instructor's profile for the rest of the transaction and returns the
 * approval status read UNDER that lock. A second concurrent request for the
 * same instructor waits here until the first commits, then sees the
 * already-reserved earnings. (Row-level conditional updates in
 * instructor-earning-repository are the second, independent guard.)
 */
export async function lockInstructorProfileInTx(tx: Prisma.TransactionClient, userId: string) {
  const rows = await tx.$queryRaw<{ approvalStatus: string }[]>`
    SELECT "approvalStatus"::text AS "approvalStatus"
    FROM "instructor_profiles"
    WHERE "userId" = ${userId}
    FOR UPDATE
  `;
  return rows[0]?.approvalStatus ?? null;
}

export function createInTx(
  tx: Prisma.TransactionClient,
  data: {
    instructorId: string;
    amount: Prisma.Decimal;
    currency: string;
    method: string;
    reference: string;
  },
) {
  return tx.payout.create({ data: { ...data, status: "PENDING" } });
}

export function findByIdInTx(tx: Prisma.TransactionClient, payoutId: string) {
  return tx.payout.findUnique({ where: { id: payoutId } });
}

/**
 * Conditional PENDING -> <next> transition. Returns count 0 if another
 * request already decided this payout — the row lock taken by this UPDATE
 * is what serialises two admins (or one double-click) racing on it.
 */
export function decidePendingInTx(
  tx: Prisma.TransactionClient,
  params: {
    payoutId: string;
    next: "PAID" | "REJECTED";
    processedById: string;
    rejectionReason: string | null;
  },
) {
  return tx.payout.updateMany({
    where: { id: params.payoutId, status: "PENDING" },
    data: {
      status: params.next,
      processedAt: new Date(),
      processedById: params.processedById,
      rejectionReason: params.rejectionReason,
    },
  });
}
