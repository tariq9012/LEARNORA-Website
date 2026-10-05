import { Prisma } from "../../generated/prisma/client";
import { getServerEnv } from "../env";

/**
 * Phase 10 finance policy — the single server-side source of truth for how
 * a sale is split between instructor and platform, and for the minimum
 * payout.
 *
 * Configured through validated environment variables (see ../env.ts):
 *
 *   INSTRUCTOR_REVENUE_SHARE_PERCENT  default 70   (instructor keeps 70%)
 *   MINIMUM_PAYOUT_AMOUNT             default 50   (USD)
 *
 * Nothing the browser sends can influence any value here: the client never
 * supplies an instructor share, platform fee, earning amount, or payout
 * minimum.
 *
 * Historical safety: the split is applied ONCE, when an earning is created
 * (payment-service.ts), and the resulting gross / commissionRate / net are
 * persisted on the InstructorEarning row. Changing the env var later only
 * affects purchases made afterwards — it never rewrites existing earnings,
 * and earnings are never recomputed from current course prices.
 *
 * All money here is Prisma.Decimal (decimal.js) — never a JS float.
 */

/** Payouts and earnings are USD-only in Phase 10 (matches Order.currency). */
export const PAYOUT_CURRENCY = "USD";

/** Phase 10 payouts are simulated; this is the only payout "method". */
export const SIMULATED_PAYOUT_METHOD = "SIMULATED";

export type FinancePolicy = {
  /** For display only (e.g. 70). Use the Decimal rates for any arithmetic. */
  instructorSharePercent: number;
  /** e.g. 0.7000 — what the instructor keeps. */
  instructorShareRate: Prisma.Decimal;
  /** e.g. 0.3000 — what the platform keeps; stored as InstructorEarning.commissionRate. */
  platformCommissionRate: Prisma.Decimal;
  /** Smallest payout an instructor may request. */
  minimumPayoutAmount: Prisma.Decimal;
  currency: string;
};

let cached: FinancePolicy | undefined;

export function getFinancePolicy(): FinancePolicy {
  if (cached) return cached;
  const env = getServerEnv();

  const instructorShareRate = new Prisma.Decimal(env.INSTRUCTOR_REVENUE_SHARE_PERCENT)
    .div(100)
    .toDecimalPlaces(4);
  const platformCommissionRate = new Prisma.Decimal(1).minus(instructorShareRate);

  cached = {
    instructorSharePercent: Number(env.INSTRUCTOR_REVENUE_SHARE_PERCENT),
    instructorShareRate,
    platformCommissionRate,
    minimumPayoutAmount: new Prisma.Decimal(env.MINIMUM_PAYOUT_AMOUNT).toDecimalPlaces(2),
    currency: PAYOUT_CURRENCY,
  };
  return cached;
}

export type EarningSplit = {
  grossAmount: Prisma.Decimal;
  /** Instructor's earning — rounded half-up to whole cents. */
  netAmount: Prisma.Decimal;
  /** Platform's share — always gross - net, so the two always add back to the sale. */
  platformAmount: Prisma.Decimal;
  /** Persisted as InstructorEarning.commissionRate. */
  commissionRate: Prisma.Decimal;
};

/**
 * Splits a sale amount using the configured revenue share. The instructor
 * amount is rounded to whole cents; the platform amount is the remainder,
 * so gross === net + platform exactly (no cent is ever created or lost).
 */
export function computeEarningSplit(
  grossAmount: Prisma.Decimal,
  policy: FinancePolicy = getFinancePolicy(),
): EarningSplit {
  const gross = grossAmount.toDecimalPlaces(2);
  const netAmount = gross
    .mul(policy.instructorShareRate)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  return {
    grossAmount: gross,
    netAmount,
    platformAmount: gross.minus(netAmount),
    commissionRate: policy.platformCommissionRate,
  };
}

/** Sums Decimals without ever touching a JS float. */
export function sumDecimals(values: Iterable<Prisma.Decimal>): Prisma.Decimal {
  let total = new Prisma.Decimal(0);
  for (const value of values) total = total.plus(value);
  return total;
}

/** Canonical 2-decimal string for DTOs / audit messages, e.g. "55.99". */
export function moneyString(value: Prisma.Decimal | null | undefined): string {
  return (value ?? new Prisma.Decimal(0)).toFixed(2);
}
