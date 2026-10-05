import { randomUUID } from "node:crypto";

import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../db/client";
import { ForbiddenError } from "../auth/guards";
import { getPaymentProvider, type PaymentProvider } from "../payments";
import * as earningRepository from "../repositories/instructor-earning-repository";
import * as orderRepository from "../repositories/order-repository";
import * as refundRepository from "../repositories/refund-repository";
import { moneyString } from "../config/finance-policy";
import { ENTITLED_ENROLLMENT_STATUSES } from "./enrollment-policy";
import { notifyRefundCompleted } from "./notification-events";
import {
  RefundError,
  earningBlockCode,
  evaluateRefundEligibility,
  refundError,
} from "./refund-policy";
import type { SafeUser } from "../auth/types";
import type { RefundDto } from "../dto/earnings";

export { RefundError } from "./refund-policy";

/** `LRN-REF-<10 hex chars>` — same shape/entropy reasoning as order numbers and certificate codes. */
function generateRefundReference(): string {
  return `LRN-REF-${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
}

function assertAdmin(user: SafeUser) {
  // Defense in depth: the server function already ran requireAdmin(); the
  // service refuses a non-admin caller on its own too.
  if (user.role !== "ADMIN") throw new ForbiddenError("Only admins can issue refunds.");
}

function toRefundDto(
  row: NonNullable<Awaited<ReturnType<typeof refundRepository.findByIdForDto>>>,
): RefundDto {
  return {
    id: row.id,
    reference: row.reference,
    orderNumber: row.payment.order.orderNumber,
    studentName: row.payment.order.user.name,
    studentEmail: row.payment.order.user.email,
    courseTitle: row.payment.order.items[0]?.course.title ?? "",
    amount: moneyString(row.amount),
    currency: row.payment.currency,
    status: row.status,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
    processedAt: row.processedAt?.toISOString() ?? null,
  };
}

/**
 * Issues a FULL, simulated refund for a paid order. Admin only.
 *
 * Sequence and transaction boundaries
 * -----------------------------------
 * 1. READ + PRE-CHECK (no locks, nothing changes): load the order, decide
 *    eligibility with the pure rules in refund-policy.ts. Fails fast with a
 *    precise reason (already refunded, earning locked in a payout, …) and,
 *    importantly, BEFORE the provider is contacted.
 * 2. PROVIDER CALL (outside the DB transaction, like Phase 9's charge): the
 *    amount comes from the DB payment, and the idempotency key is derived
 *    from the payment id, so two requests can never make a real provider
 *    refund twice. The simulated provider moves no money.
 * 3. ONE PRISMA TRANSACTION applies every local change or none of them:
 *      a. Payment  PAID -> REFUNDED   (conditional UPDATE — the row lock is
 *         what serialises duplicate/concurrent requests; the loser matches
 *         0 rows and aborts)
 *      b. Order    PAID -> REFUNDED   (conditional UPDATE)
 *      c. Refund row created (PROCESSED); UNIQUE(paymentId) is a second,
 *         independent guard against a double refund
 *      d. InstructorEarning AVAILABLE -> REVERSED (conditional UPDATE that
 *         also requires payoutId IS NULL, so an earning a payout request has
 *         just reserved can't be reversed from under it), linked to the refund
 *      e. Enrollment -> CANCELLED (entitlement revoked) unless the student
 *         holds another PAID order for the same course
 *    If ANY step fails or matches zero rows, the whole transaction rolls
 *    back: there is no state where the refund exists but the student is
 *    still entitled, or the earning is reversed without a refund record.
 *
 * Known limitation (documented in the Phase 10 report): with a REAL
 * provider, step 2 succeeding and step 3 failing would leave the provider
 * refunded but the local DB unchanged. Because the provider call is
 * idempotent per payment, the admin simply retries and step 3 completes.
 * The simulated provider moves no money, so this cannot lose funds here.
 */
export async function refundOrder(
  admin: SafeUser,
  orderId: string,
  options: { reason?: string | null | undefined } = {},
  provider: PaymentProvider = getPaymentProvider(),
): Promise<RefundDto> {
  assertAdmin(admin);

  // -- 1. Pre-check ---------------------------------------------------------
  const order = await orderRepository.findOrderForRefund(orderId);
  if (!order) throw refundError("NOT_FOUND");

  const eligibility = evaluateRefundEligibility(order);
  if (!eligibility.ok) throw refundError(eligibility.code);

  const payment = order.payments.find((p) => p.id === eligibility.paymentId)!;

  // "Corresponding enrollment exists": every paid order creates/reactivates
  // one atomically (payment-service.ts), so a missing row means the data is
  // not what a valid paid purchase looks like.
  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId: order.userId, courseId: eligibility.courseId } },
    select: { id: true },
  });
  if (!enrollment) throw refundError("NO_ENROLLMENT");

  const reason = options.reason?.trim() ? options.reason.trim().slice(0, 500) : null;

  // -- 2. Provider ----------------------------------------------------------
  const providerResult = await provider.refund({
    amount: moneyString(payment.amount),
    currency: payment.currency,
    reference: order.orderNumber,
    paymentExternalReference: payment.externalReference,
    idempotencyKey: `refund:${payment.id}`,
  });
  if (providerResult.status === "FAILED") throw refundError("PROVIDER_DECLINED");

  // -- 3. Atomic local state change ------------------------------------------
  let refundId: string;
  try {
    refundId = await prisma.$transaction(async (tx) => {
      // a. Payment — the serialisation point for duplicate requests.
      const paymentClaim = await tx.payment.updateMany({
        where: { id: payment.id, orderId: order.id, status: "PAID" },
        data: { status: "REFUNDED" },
      });
      if (paymentClaim.count === 0) throw refundError("ALREADY_REFUNDED");

      // b. Order
      const orderClaim = await tx.order.updateMany({
        where: { id: order.id, status: "PAID" },
        data: { status: "REFUNDED" },
      });
      if (orderClaim.count === 0) throw refundError("ALREADY_REFUNDED");

      // c. Refund record (amount = the payment's amount, never client input)
      const refund = await refundRepository.createInTx(tx, {
        paymentId: payment.id,
        reference: generateRefundReference(),
        externalReference: providerResult.providerReference,
        amount: payment.amount,
        reason,
        adminId: admin.id,
      });

      // d. Reverse the instructor's earning, if this sale created one.
      if (eligibility.earning) {
        const reversed = await earningRepository.reverseInTx(tx, {
          earningId: eligibility.earning.id,
          refundId: refund.id,
        });
        if (reversed.count === 0) {
          // Lost a race with a payout request (or it was already handled).
          const current = await earningRepository.findStatusInTx(tx, eligibility.earning.id);
          throw refundError(earningBlockCode(current?.status));
        }
      }

      // e. Revoke the student's entitlement (kept as CANCELLED, not deleted,
      //    so learning history/audit survive) — unless they legitimately hold
      //    a different PAID order for the same course.
      const otherPaidOrders = await tx.order.count({
        where: {
          userId: order.userId,
          status: "PAID",
          id: { not: order.id },
          items: { some: { courseId: eligibility.courseId } },
        },
      });
      if (otherPaidOrders === 0) {
        await tx.enrollment.updateMany({
          where: {
            userId: order.userId,
            courseId: eligibility.courseId,
            status: { in: [...ENTITLED_ENROLLMENT_STATUSES] },
          },
          data: { status: "CANCELLED" },
        });
      }

      return refund.id;
    });
  } catch (error) {
    // A unique-constraint hit on Refund.paymentId means a concurrent request
    // already inserted the refund — same outcome as "already refunded".
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw refundError("ALREADY_REFUNDED");
    }
    throw error;
  }

  // Phase 11: reached ONLY after the refund transaction committed (a duplicate/
  // losing request threw above), so there is exactly one notification per
  // refund — also enforced by the eventKey. Best-effort: never affects the refund.
  const course = await prisma.course.findUnique({
    where: { id: eligibility.courseId },
    select: { title: true, instructorId: true },
  });
  await notifyRefundCompleted({
    refundId,
    orderNumber: order.orderNumber,
    courseTitle: course?.title ?? "your course",
    amount: moneyString(payment.amount),
    currency: payment.currency,
    studentId: order.userId,
    instructorId: eligibility.earning ? (course?.instructorId ?? null) : null,
  });

  const row = await refundRepository.findByIdForDto(refundId);
  if (!row)
    throw new RefundError("INCONSISTENT_DATA", "Refund was recorded but could not be loaded.");
  return toRefundDto(row);
}

/** Admin refund history. */
export async function getAdminRefunds(admin: SafeUser): Promise<RefundDto[]> {
  assertAdmin(admin);
  const rows = await refundRepository.listAll();
  return rows.map(toRefundDto);
}
