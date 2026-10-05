import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../db/client";
import { ForbiddenError } from "../auth/guards";
import {
  PAYOUT_CURRENCY,
  getFinancePolicy,
  moneyString,
  sumDecimals,
} from "../config/finance-policy";
import * as earningRepository from "../repositories/instructor-earning-repository";
import * as payoutRepository from "../repositories/payout-repository";
import * as refundRepository from "../repositories/refund-repository";
import type { SafeUser } from "../auth/types";
import type {
  AdminFinanceStatsDto,
  EarningsMonthDto,
  InstructorEarningDto,
  InstructorEarningsDto,
  InstructorEarningsSummaryDto,
} from "../dto/earnings";

/** How many earning rows the earnings page loads. The summary numbers are always computed over ALL earnings, not just these. */
const HISTORY_LIMIT = 100;
const CHART_MONTHS = 6;

function assertInstructor(user: SafeUser) {
  if (user.role !== "INSTRUCTOR") throw new ForbiddenError("Only instructors can do that.");
}

function assertAdmin(user: SafeUser) {
  if (user.role !== "ADMIN") throw new ForbiddenError("Only admins can do that.");
}

/**
 * Earnings summary for the SIGNED-IN instructor. The instructor id is the
 * session user's id — there is deliberately no instructorId parameter that a
 * caller (or a request body) could vary, which is what makes "Instructor B
 * can't see Instructor A's earnings" structural rather than a check someone
 * has to remember.
 *
 * Every number is an exact Decimal sum of persisted InstructorEarning rows
 * (created when a paid purchase committed, with the split as it was THEN).
 * Nothing is derived from current course prices or enrollment counts.
 *
 * Definitions (mutually exclusive by status):
 *   availableBalance = AVAILABLE   (not reserved by any payout)
 *   pendingPayout    = RESERVED    (locked into a PENDING payout request)
 *   paidOut          = PAID
 *   reversedAmount   = REVERSED    (order refunded)
 *   totalEarned      = AVAILABLE + RESERVED + PAID   (i.e. net of refunds)
 */
export async function getInstructorEarningsSummary(
  instructor: SafeUser,
): Promise<InstructorEarningsSummaryDto> {
  assertInstructor(instructor);
  const policy = getFinancePolicy();

  const [groups, profile] = await Promise.all([
    earningRepository.sumsByStatusForInstructor(instructor.id),
    prisma.instructorProfile.findUnique({
      where: { userId: instructor.id },
      select: { approvalStatus: true },
    }),
  ]);

  const sumFor = (status: string) =>
    groups.find((g) => g.status === status)?._sum.netAmount ?? new Prisma.Decimal(0);

  const available = sumFor("AVAILABLE");
  const reserved = sumFor("RESERVED");
  const paid = sumFor("PAID");
  const reversed = sumFor("REVERSED");

  const approved = profile?.approvalStatus === "APPROVED";
  const meetsMinimum = available.gte(policy.minimumPayoutAmount);
  let payoutBlockedReason: string | null = null;
  if (!approved) {
    payoutBlockedReason =
      "Payouts are available once an admin has approved your instructor account.";
  } else if (!meetsMinimum) {
    payoutBlockedReason = `The minimum payout is $${moneyString(policy.minimumPayoutAmount)}.`;
  }

  return {
    currency: PAYOUT_CURRENCY,
    totalEarned: moneyString(sumDecimals([available, reserved, paid])),
    availableBalance: moneyString(available),
    pendingPayout: moneyString(reserved),
    paidOut: moneyString(paid),
    reversedAmount: moneyString(reversed),
    revenueSharePercent: policy.instructorSharePercent,
    minimumPayout: moneyString(policy.minimumPayoutAmount),
    canRequestPayout: approved && meetsMinimum,
    payoutBlockedReason,
  };
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Last N calendar months (UTC), oldest first, each summed with Decimal. Display-only — the chart is not authoritative for anything. */
async function getMonthlyEarnings(instructorId: string): Promise<EarningsMonthDto[]> {
  const now = new Date();
  const buckets: { key: string; label: string; total: Prisma.Decimal }[] = [];
  for (let i = CHART_MONTHS - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    buckets.push({
      key: monthKey(d),
      label: new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(d),
      total: new Prisma.Decimal(0),
    });
  }

  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (CHART_MONTHS - 1), 1));
  const rows = await earningRepository.listNonReversedSince(instructorId, since);
  for (const row of rows) {
    const bucket = buckets.find((b) => b.key === monthKey(row.createdAt));
    if (bucket) bucket.total = bucket.total.plus(row.netAmount);
  }

  return buckets.map((b) => ({ month: b.label, value: Number(b.total.toFixed(2)) }));
}

/** The signed-in instructor's earnings page data: summary, recent earning history, and the monthly chart. */
export async function getInstructorEarnings(instructor: SafeUser): Promise<InstructorEarningsDto> {
  assertInstructor(instructor);

  const [summary, rows, total, monthly] = await Promise.all([
    getInstructorEarningsSummary(instructor),
    earningRepository.listForInstructor(instructor.id, HISTORY_LIMIT),
    earningRepository.countForInstructor(instructor.id),
    getMonthlyEarnings(instructor.id),
  ]);

  const earnings: InstructorEarningDto[] = rows.map((row) => ({
    id: row.id,
    courseTitle: row.orderItem.course.title,
    orderNumber: row.orderItem.order.orderNumber,
    purchasedAt: row.createdAt.toISOString(),
    currency: row.orderItem.order.currency,
    grossAmount: moneyString(row.grossAmount),
    netAmount: moneyString(row.netAmount),
    platformAmount: moneyString(row.grossAmount.minus(row.netAmount)),
    status: row.status,
  }));

  return { summary, earnings, historyTruncated: total > earnings.length, monthly };
}

/** Real numbers for the admin dashboard: open payouts and refunds. */
export async function getAdminFinanceStats(admin: SafeUser): Promise<AdminFinanceStatsDto> {
  assertAdmin(admin);
  const [open, paid, refunds] = await Promise.all([
    payoutRepository.aggregateOpen(),
    payoutRepository.aggregatePaid(),
    refundRepository.aggregateProcessed(),
  ]);
  return {
    currency: PAYOUT_CURRENCY,
    pendingPayoutCount: open._count._all,
    pendingPayoutAmount: moneyString(open._sum.amount),
    paidOutAmount: moneyString(paid._sum.amount),
    refundCount: refunds._count._all,
    refundedAmount: moneyString(refunds._sum.amount),
  };
}
