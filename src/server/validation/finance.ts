import { z } from "zod";

/**
 * Phase 10 input schemas (earnings, payouts, refunds).
 *
 * All are `.strict()`: an unexpected field — say a tampered `amount`,
 * `instructorId`, or `status` on a refund/payout call — is rejected outright
 * rather than being silently ignored, so an unknown field can never become a
 * business-authoritative value by accident later.
 */

/** Opaque record ids (cuid) — validated for shape only; authorization is never inferred from an id. */
const recordId = (label: string) =>
  z
    .string({ required_error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(64, `${label} is invalid`)
    .regex(/^[A-Za-z0-9_-]+$/, `${label} is invalid`);

export const payoutIdSchema = z.object({ payoutId: recordId("Payout") }).strict();

/**
 * `expectedAmount` is NOT an amount to pay out — the server always pays out
 * its own computed available balance. It is the balance the instructor saw
 * on screen; the request is refused if the real balance differs. It must be
 * a plain non-negative decimal with at most 2 places ("55.99"): no sign, no
 * exponent, no thousands separators, no third decimal.
 */
export const requestPayoutSchema = z
  .object({
    expectedAmount: z
      .string({ required_error: "Amount is required" })
      .trim()
      .regex(/^\d{1,8}(\.\d{1,2})?$/, "Enter a valid amount with at most 2 decimal places."),
  })
  .strict();

export const rejectPayoutSchema = z
  .object({
    payoutId: recordId("Payout"),
    reason: z.string().trim().max(300, "Reason must be 300 characters or fewer.").optional(),
  })
  .strict();

export const refundOrderSchema = z
  .object({
    orderId: recordId("Order"),
    reason: z.string().trim().max(500, "Reason must be 500 characters or fewer.").optional(),
  })
  .strict();
