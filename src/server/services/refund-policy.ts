import type { Prisma } from "../../generated/prisma/client";

/**
 * Pure refund-eligibility rules (Phase 10) — no database access, so the
 * SAME decision is used by:
 *   - the admin orders listing (to show/hide/disable the Refund button), and
 *   - refund-service.ts (as the authoritative pre-check before anything is
 *     changed; the transaction then re-verifies the racy parts under locks).
 *
 * Refund policy in one paragraph: only ADMINs refund, only FULL refunds,
 * only an order that is PAID and has exactly one PAID payment that hasn't
 * been refunded, and only while the instructor's earning for that sale is
 * still a plain AVAILABLE earning. An earning locked in a pending payout, or
 * already paid out, blocks the refund (no negative balances in Phase 10 —
 * see the limitations in the Phase 10 report).
 */

export type RefundErrorCode =
  | "NOT_FOUND"
  | "NOT_PAID"
  | "ALREADY_REFUNDED"
  | "NO_PAYMENT"
  | "UNSUPPORTED_ORDER"
  | "INCONSISTENT_DATA"
  | "NO_ENROLLMENT"
  | "EARNING_LOCKED_IN_PAYOUT"
  | "EARNING_ALREADY_PAID_OUT"
  | "PROVIDER_DECLINED";

export class RefundError extends Error {
  readonly code: RefundErrorCode;
  constructor(code: RefundErrorCode, message: string) {
    super(message);
    this.name = "RefundError";
    this.code = code;
  }
}

export const REFUND_MESSAGES: Record<RefundErrorCode, string> = {
  NOT_FOUND: "Order not found.",
  NOT_PAID: "Only successfully paid orders can be refunded.",
  ALREADY_REFUNDED: "This order has already been refunded.",
  NO_PAYMENT: "This order has no successful payment to refund.",
  UNSUPPORTED_ORDER: "Only single-course orders can be refunded.",
  INCONSISTENT_DATA:
    "This order's records don't line up (payment/order amounts or earning state), so it can't be refunded automatically.",
  NO_ENROLLMENT: "This order has no matching enrollment, so it can't be refunded automatically.",
  EARNING_LOCKED_IN_PAYOUT:
    "The instructor's earning for this sale is part of a pending payout request. Reject that payout first (it releases the earning), then refund the order.",
  EARNING_ALREADY_PAID_OUT:
    "The instructor has already been paid for this sale, so it can't be refunded automatically. It needs a manual/offline adjustment.",
  PROVIDER_DECLINED: "The payment provider did not accept the refund. Nothing was changed.",
};

export function refundError(code: RefundErrorCode): RefundError {
  return new RefundError(code, REFUND_MESSAGES[code]);
}

/** The minimal order shape the rules need — satisfied structurally by the Prisma results in order-repository.ts. */
export type RefundableOrderShape = {
  status: string;
  amount: Prisma.Decimal;
  items: {
    id: string;
    courseId: string;
    earning: { id: string; status: string; payoutId: string | null } | null;
  }[];
  payments: {
    id: string;
    status: string;
    amount: Prisma.Decimal;
    refund: { id: string } | null;
  }[];
};

export type RefundEligibility =
  | {
      ok: true;
      paymentId: string;
      itemId: string;
      courseId: string;
      earning: { id: string; status: string; payoutId: string | null } | null;
    }
  | { ok: false; code: RefundErrorCode };

/**
 * Maps a non-AVAILABLE earning state to the right refusal. Shared with the
 * refund transaction so the in-transaction re-check reports exactly the
 * same reasons as the pre-check.
 */
export function earningBlockCode(status: string | null | undefined): RefundErrorCode {
  if (status === "RESERVED") return "EARNING_LOCKED_IN_PAYOUT";
  if (status === "PAID") return "EARNING_ALREADY_PAID_OUT";
  return "INCONSISTENT_DATA";
}

export function evaluateRefundEligibility(order: RefundableOrderShape): RefundEligibility {
  // Already refunded (order flag or a refund row on any payment).
  if (order.status === "REFUNDED" || order.payments.some((p) => p.refund)) {
    return { ok: false, code: "ALREADY_REFUNDED" };
  }
  if (order.status !== "PAID") return { ok: false, code: "NOT_PAID" };

  if (order.items.length !== 1) return { ok: false, code: "UNSUPPORTED_ORDER" };
  const item = order.items[0]!;

  const paidPayments = order.payments.filter((p) => p.status === "PAID");
  if (paidPayments.length === 0) return { ok: false, code: "NO_PAYMENT" };
  if (paidPayments.length > 1) return { ok: false, code: "INCONSISTENT_DATA" };
  const payment = paidPayments[0]!;

  // The full refund amount is the payment amount; it must match the order.
  if (!payment.amount.equals(order.amount)) return { ok: false, code: "INCONSISTENT_DATA" };

  if (item.earning && (item.earning.status !== "AVAILABLE" || item.earning.payoutId !== null)) {
    return { ok: false, code: earningBlockCode(item.earning.status) };
  }

  return {
    ok: true,
    paymentId: payment.id,
    itemId: item.id,
    courseId: item.courseId,
    earning: item.earning,
  };
}
