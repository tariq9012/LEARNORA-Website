import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../db/client";
import * as orderRepository from "../repositories/order-repository";
import * as paymentRepository from "../repositories/payment-repository";
import { isEnrollmentEntitled } from "./enrollment-policy";
import { toOrderSummaryDTO, OrderNotFoundError } from "./checkout-service";
import { getPaymentProvider } from "../payments";
import type { SafeUser } from "../auth/types";
import type { OrderSummaryDTO } from "../dto/checkout";

export { OrderNotFoundError };

export class PaymentError extends Error {}
export class OrderNotPayableError extends PaymentError {
  constructor() {
    super("This order can no longer be paid.");
  }
}
export class PaymentFailedError extends PaymentError {
  constructor() {
    super("Payment failed. You can try again.");
  }
}

/** Instructor keeps 70% of the sale — a fixed Phase 9 default, not yet a per-instructor negotiated rate (that's a future enhancement, not scope here). */
const PLATFORM_COMMISSION_RATE = new Prisma.Decimal("0.3000");
const INSTRUCTOR_SHARE_RATE = new Prisma.Decimal("0.7000");

/** Thrown internally to abort the transaction when a concurrent request already claimed the order — never surfaced to the caller, see confirmTestPayment's catch. */
class OrderAlreadyClaimedError extends Error {}

/**
 * Confirms a test payment for a PENDING order the caller owns.
 *
 * Idempotency/concurrency: a repeated call for an already-PAID order
 * short-circuits to its current state without charging again. For two
 * genuinely concurrent calls, both may reach the provider (harmless —
 * it's simulated), but only one can win the transaction's conditional
 * `UPDATE orders SET status='PAID' WHERE status='PENDING'` — Postgres's
 * row lock on that UPDATE is what actually serializes the two attempts,
 * not application-level checks. The loser's transaction is deliberately
 * aborted (throwing OrderAlreadyClaimedError rolls it back) and it
 * simply re-reads the winner's now-committed result instead of erroring
 * out to the user.
 *
 * Atomic success transaction: Payment row, Order status, Enrollment
 * activation, and the InstructorEarning ledger entry all commit or roll
 * back together — there is no state where a payment is marked PAID
 * without an enrollment, or vice versa.
 */
export async function confirmTestPayment(
  user: SafeUser,
  orderId: string,
  options?: { simulateFailure?: boolean },
): Promise<OrderSummaryDTO> {
  const order = await orderRepository.findOrderById(orderId);
  if (!order || order.userId !== user.id) throw new OrderNotFoundError();

  // Already resolved — return it as-is rather than processing again.
  if (order.status === "PAID") return toOrderSummaryDTO(order);
  if (order.status !== "PENDING") throw new OrderNotPayableError();

  const item = order.items[0];
  if (!item) throw new OrderNotPayableError();

  const provider = getPaymentProvider();
  const intent = await provider.charge({
    amount: Number(order.amount),
    currency: order.currency,
    reference: order.orderNumber,
    simulateFailure: options?.simulateFailure,
  });

  if (intent.status === "FAILED") {
    await paymentRepository.createPayment({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      status: "FAILED",
      provider: provider.kind,
      externalReference: intent.providerReference,
    });
    // Conditional — if another request already moved this order to PAID
    // in the meantime, this correctly does nothing rather than
    // clobbering a real success with a late failure.
    await orderRepository.markOrderFailedIfPending(order.id);
    throw new PaymentFailedError();
  }

  try {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: { id: order.id, status: "PENDING" },
        data: { status: "PAID" },
      });
      if (claimed.count === 0) throw new OrderAlreadyClaimedError();

      await paymentRepository.createPaymentInTx(tx, {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        status: "PAID",
        provider: provider.kind,
        externalReference: intent.providerReference,
      });

      const existingEnrollment = await tx.enrollment.findUnique({
        where: { userId_courseId: { userId: user.id, courseId: item.courseId } },
      });
      if (!existingEnrollment) {
        await tx.enrollment.create({ data: { userId: user.id, courseId: item.courseId } });
      } else if (!isEnrollmentEntitled(existingEnrollment.status)) {
        // Reactivating a CANCELLED enrollment via repurchase — same rule
        // as the free-enrollment path (enrollment-service.ts).
        await tx.enrollment.update({
          where: { id: existingEnrollment.id },
          data: { status: "ACTIVE", completedAt: null },
        });
      }
      // An already-ACTIVE/COMPLETED enrollment can't reach here at all —
      // checkout eligibility (createCheckoutOrder) already rejects a
      // purchase attempt for a course the student is already entitled to.

      const course = await tx.course.findUnique({
        where: { id: item.courseId },
        select: { instructorId: true },
      });
      if (course) {
        await tx.instructorEarning.create({
          data: {
            instructorId: course.instructorId,
            orderItemId: item.id,
            grossAmount: item.price,
            commissionRate: PLATFORM_COMMISSION_RATE,
            netAmount: item.price.mul(INSTRUCTOR_SHARE_RATE).toDecimalPlaces(2),
          },
        });
      }
    });
  } catch (error) {
    if (error instanceof OrderAlreadyClaimedError) {
      const fresh = await orderRepository.findOrderById(orderId);
      if (fresh) return toOrderSummaryDTO(fresh);
    }
    throw error;
  }

  const fresh = await orderRepository.findOrderById(orderId);
  if (!fresh) throw new OrderNotFoundError();
  return toOrderSummaryDTO(fresh);
}
