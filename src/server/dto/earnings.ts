/**
 * Phase 10 DTOs — earnings, payouts, refunds.
 *
 * Deliberately explicit shapes (never raw Prisma rows). Money is sent as a
 * canonical 2-decimal STRING (e.g. "55.99") produced from Decimal on the
 * server, so nothing between the database and the screen ever passes through
 * a JS float that could be mistaken for an authoritative amount. The client
 * only formats these for display.
 */

export type EarningStatusDto = "AVAILABLE" | "RESERVED" | "PAID" | "REVERSED";
export type PayoutStatusDto = "PENDING" | "PROCESSING" | "PAID" | "FAILED" | "REJECTED";
export type RefundStatusDto = "REQUESTED" | "APPROVED" | "REJECTED" | "PROCESSED";

export type InstructorEarningsSummaryDto = {
  currency: string;
  /** AVAILABLE + RESERVED + PAID — everything earned and not reversed. */
  totalEarned: string;
  /** AVAILABLE and not reserved by any payout — what can be requested now. */
  availableBalance: string;
  /** RESERVED — locked into a PENDING payout request awaiting admin action. */
  pendingPayout: string;
  /** PAID — included in a payout an admin marked paid (simulated). */
  paidOut: string;
  /** REVERSED — earnings cancelled by a refund. */
  reversedAmount: string;
  /** The CURRENT configured share for new sales (existing earnings keep theirs). */
  revenueSharePercent: number;
  minimumPayout: string;
  /** True only for an APPROVED instructor whose available balance meets the minimum. */
  canRequestPayout: boolean;
  /** Why canRequestPayout is false, phrased for the UI; null when it's true. */
  payoutBlockedReason: string | null;
};

export type InstructorEarningDto = {
  id: string;
  courseTitle: string;
  /** The student's order receipt reference (LRN-ORD-…). No student identity is included. */
  orderNumber: string;
  /** When the paid purchase committed (the earning was created in the same transaction). */
  purchasedAt: string;
  currency: string;
  grossAmount: string;
  /** The instructor's earning. */
  netAmount: string;
  /** gross - net; always derivable, never stored separately. */
  platformAmount: string;
  status: EarningStatusDto;
};

export type EarningsMonthDto = { month: string; value: number };

export type InstructorEarningsDto = {
  summary: InstructorEarningsSummaryDto;
  earnings: InstructorEarningDto[];
  /** True when there are more earnings than `earnings` contains. */
  historyTruncated: boolean;
  /** Last 6 calendar months (UTC) of non-reversed earnings — for the chart, display only. */
  monthly: EarningsMonthDto[];
};

export type PayoutDto = {
  id: string;
  reference: string;
  amount: string;
  currency: string;
  status: PayoutStatusDto;
  requestedAt: string;
  /** When an admin decided the request; for PAID this is the paid-at date. */
  processedAt: string | null;
  /** Only set for REJECTED payouts. */
  rejectionReason: string | null;
  /** Always "SIMULATED" in Phase 10. */
  method: string;
};

/** Admin-only: adds the instructor identity to PayoutDto. */
export type AdminPayoutDto = PayoutDto & {
  instructorName: string;
  instructorEmail: string;
  /** How many earnings this payout reserved. */
  earningsCount: number;
  /** Name of the admin who decided it, if any. */
  processedByName: string | null;
};

/** Admin-only refund history row. Never includes provider references. */
export type RefundDto = {
  id: string;
  reference: string;
  orderNumber: string;
  studentName: string;
  studentEmail: string;
  courseTitle: string;
  amount: string;
  currency: string;
  status: RefundStatusDto;
  reason: string | null;
  createdAt: string;
  processedAt: string | null;
};

export type AdminFinanceStatsDto = {
  currency: string;
  pendingPayoutCount: number;
  pendingPayoutAmount: string;
  paidOutAmount: string;
  refundCount: number;
  refundedAmount: string;
};
