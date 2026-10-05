import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { ForbiddenError, UnauthorizedError, requireAdmin } from "../auth/guards";
import { getAdminFinanceStats } from "../services/earnings-service";
import {
  PayoutError,
  approvePayout,
  getAdminPayouts,
  rejectPayout,
} from "../services/payout-service";
import { RefundError, getAdminRefunds, refundOrder } from "../services/refund-service";
import { payoutIdSchema, refundOrderSchema, rejectPayoutSchema } from "../validation/finance";
import type { AdminFinanceStatsDto, AdminPayoutDto, RefundDto } from "../dto/earnings";

/**
 * Admin-only finance server functions (Phase 10): refunds and payout
 * processing. Every handler starts with requireAdmin() — hiding a button in
 * the UI is never the protection. They are createServerFn handlers, so they
 * keep TanStack Start's built-in CSRF protection for the mutations.
 */

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

function toActionError(error: unknown): { success: false; error: string } {
  if (error instanceof z.ZodError) {
    return { success: false, error: error.issues[0]?.message ?? "Invalid input." };
  }
  if (error instanceof UnauthorizedError) {
    return { success: false, error: "Please log in to continue." };
  }
  if (error instanceof ForbiddenError) {
    return { success: false, error: "Only admins can do that." };
  }
  if (error instanceof RefundError || error instanceof PayoutError) {
    return { success: false, error: error.message };
  }
  console.error("[admin-finance] unexpected error", error);
  return { success: false, error: "Something went wrong. Please try again." };
}

// -- Refunds ----------------------------------------------------------------

/**
 * Issues a full simulated refund. The client sends ONLY the order id (and an
 * optional free-text reason): the payment, amount, course, student and
 * instructor earning are all derived server-side from the order. The strict
 * schema rejects any extra field (e.g. a tampered `amount`).
 */
export const refundOrderFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => refundOrderSchema.parse(data))
  .handler(async ({ data }): Promise<ActionResult<RefundDto>> => {
    try {
      const admin = await requireAdmin();
      const refund = await refundOrder(admin, data.orderId, { reason: data.reason });
      return { success: true, data: refund };
    } catch (error) {
      return toActionError(error);
    }
  });

export const getAdminRefundsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<RefundDto[]> => {
    const admin = await requireAdmin();
    return getAdminRefunds(admin);
  },
);

// -- Payouts ----------------------------------------------------------------

export const getAdminPayoutsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<AdminPayoutDto[]> => {
    const admin = await requireAdmin();
    return getAdminPayouts(admin);
  },
);

/** Approve = mark PAID. Simulated: no real funds are transferred. */
export const approvePayoutFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => payoutIdSchema.parse(data))
  .handler(async ({ data }): Promise<ActionResult<AdminPayoutDto>> => {
    try {
      const admin = await requireAdmin();
      const payout = await approvePayout(admin, data.payoutId);
      return { success: true, data: payout };
    } catch (error) {
      return toActionError(error);
    }
  });

export const rejectPayoutFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => rejectPayoutSchema.parse(data))
  .handler(async ({ data }): Promise<ActionResult<AdminPayoutDto>> => {
    try {
      const admin = await requireAdmin();
      const payout = await rejectPayout(admin, data.payoutId, data.reason);
      return { success: true, data: payout };
    } catch (error) {
      return toActionError(error);
    }
  });

/** Real pending-payout / refund numbers for the admin dashboard. */
export const getAdminFinanceStatsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<AdminFinanceStatsDto> => {
    const admin = await requireAdmin();
    return getAdminFinanceStats(admin);
  },
);
