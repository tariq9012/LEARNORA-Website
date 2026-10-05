import { prisma } from "../db/client";
import type { Prisma } from "../../generated/prisma/client";

/**
 * Persistence for InstructorEarning (Phase 10). Read helpers always take an
 * explicit `instructorId` that the SERVICE derives from the authenticated
 * session — nothing here accepts an id "from the client". Functions ending
 * in `InTx` run inside a caller-supplied transaction and are the building
 * blocks for the atomic refund/payout state changes.
 *
 * State machine (see EarningStatus in schema.prisma):
 *   AVAILABLE --reserve--> RESERVED --markPaid--> PAID
 *   RESERVED  --release--> AVAILABLE      (payout rejected)
 *   AVAILABLE --reverse--> REVERSED       (order refunded)
 * Every transition below is a CONDITIONAL updateMany (`WHERE status = <from>`),
 * so a stale/concurrent caller matches zero rows instead of corrupting state.
 */

// ---------------------------------------------------------------------------
// Reads (instructor-scoped)
// ---------------------------------------------------------------------------

export function sumsByStatusForInstructor(instructorId: string) {
  return prisma.instructorEarning.groupBy({
    by: ["status"],
    where: { instructorId },
    _sum: { netAmount: true },
  });
}

export function listForInstructor(instructorId: string, take: number) {
  return prisma.instructorEarning.findMany({
    where: { instructorId },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      status: true,
      grossAmount: true,
      netAmount: true,
      createdAt: true,
      orderItem: {
        select: {
          course: { select: { title: true } },
          order: { select: { orderNumber: true, currency: true } },
        },
      },
    },
  });
}

export function countForInstructor(instructorId: string) {
  return prisma.instructorEarning.count({ where: { instructorId } });
}

/** Non-reversed earnings since `since` — the chart's raw material (aggregated per month in the service, with Decimal). */
export function listNonReversedSince(instructorId: string, since: Date) {
  return prisma.instructorEarning.findMany({
    where: { instructorId, status: { not: "REVERSED" }, createdAt: { gte: since } },
    select: { createdAt: true, netAmount: true },
  });
}

// ---------------------------------------------------------------------------
// Transactional building blocks
// ---------------------------------------------------------------------------

/** Earnings that can be withdrawn right now: AVAILABLE and not attached to any payout. */
export function listAvailableInTx(tx: Prisma.TransactionClient, instructorId: string) {
  return tx.instructorEarning.findMany({
    where: { instructorId, status: "AVAILABLE", payoutId: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, netAmount: true },
  });
}

/**
 * AVAILABLE -> RESERVED for exactly the given ids. The WHERE re-checks
 * status, ownership and that no payout already claimed them, so it returns
 * fewer rows than requested if anything changed since they were read.
 */
export function reserveInTx(
  tx: Prisma.TransactionClient,
  params: { earningIds: string[]; instructorId: string; payoutId: string },
) {
  return tx.instructorEarning.updateMany({
    where: {
      id: { in: params.earningIds },
      instructorId: params.instructorId,
      status: "AVAILABLE",
      payoutId: null,
    },
    data: { status: "RESERVED", payoutId: params.payoutId },
  });
}

export function listByPayoutInTx(tx: Prisma.TransactionClient, payoutId: string) {
  return tx.instructorEarning.findMany({
    where: { payoutId },
    select: { id: true, instructorId: true, status: true, netAmount: true },
  });
}

/** RESERVED -> PAID for everything reserved by the payout. */
export function markPaidForPayoutInTx(tx: Prisma.TransactionClient, payoutId: string) {
  return tx.instructorEarning.updateMany({
    where: { payoutId, status: "RESERVED" },
    data: { status: "PAID" },
  });
}

/** RESERVED -> AVAILABLE (and detach from the payout) — used when a payout is rejected. */
export function releaseForPayoutInTx(tx: Prisma.TransactionClient, payoutId: string) {
  return tx.instructorEarning.updateMany({
    where: { payoutId, status: "RESERVED" },
    data: { status: "AVAILABLE", payoutId: null },
  });
}

/** AVAILABLE -> REVERSED, linking the refund that caused it. Zero rows = it is no longer a plain, unlocked AVAILABLE earning. */
export function reverseInTx(
  tx: Prisma.TransactionClient,
  params: { earningId: string; refundId: string },
) {
  return tx.instructorEarning.updateMany({
    where: { id: params.earningId, status: "AVAILABLE", payoutId: null },
    data: { status: "REVERSED", refundId: params.refundId },
  });
}

export function findStatusInTx(tx: Prisma.TransactionClient, earningId: string) {
  return tx.instructorEarning.findUnique({
    where: { id: earningId },
    select: { status: true, payoutId: true },
  });
}

/** Non-reversed earnings with their course, for the instructor analytics per-course + status totals. Scoped to one instructor. */
export function listNonReversedWithCourse(instructorId: string) {
  return prisma.instructorEarning.findMany({
    where: { instructorId, status: { not: "REVERSED" } },
    select: { status: true, netAmount: true, orderItem: { select: { courseId: true } } },
  });
}
