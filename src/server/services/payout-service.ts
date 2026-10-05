import { randomUUID } from "node:crypto";

import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../db/client";
import { ForbiddenError } from "../auth/guards";
import {
  PAYOUT_CURRENCY,
  SIMULATED_PAYOUT_METHOD,
  getFinancePolicy,
  moneyString,
  sumDecimals,
} from "../config/finance-policy";
import { requestPayoutSchema } from "../validation/finance";
import {
  notifyPayoutPaid,
  notifyPayoutRejected,
  notifyPayoutRequested,
} from "./notification-events";
import * as earningRepository from "../repositories/instructor-earning-repository";
import * as payoutRepository from "../repositories/payout-repository";
import type { SafeUser } from "../auth/types";
import type { AdminPayoutDto, PayoutDto } from "../dto/earnings";

export type PayoutErrorCode =
  | "NOT_APPROVED"
  | "NO_BALANCE"
  | "BELOW_MINIMUM"
  | "AMOUNT_MISMATCH"
  | "CONFLICT"
  | "NOT_FOUND"
  | "ALREADY_PROCESSED"
  | "INTEGRITY";

export class PayoutError extends Error {
  readonly code: PayoutErrorCode;
  constructor(code: PayoutErrorCode, message: string) {
    super(message);
    this.name = "PayoutError";
    this.code = code;
  }
}

/** `LRN-PAY-<10 hex chars>` — same shape/entropy reasoning as order numbers and certificate codes. */
function generatePayoutReference(): string {
  return `LRN-PAY-${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
}

function assertInstructor(user: SafeUser) {
  if (user.role !== "INSTRUCTOR") throw new ForbiddenError("Only instructors can do that.");
}

function assertAdmin(user: SafeUser) {
  // Defense in depth on top of requireAdmin() in the server function: an
  // instructor can never mark their own payout paid, even if a bug ever
  // routed them to this service.
  if (user.role !== "ADMIN") throw new ForbiddenError("Only admins can process payouts.");
}

function toPayoutDto(row: {
  id: string;
  reference: string | null;
  amount: Prisma.Decimal;
  currency: string;
  status: PayoutDto["status"];
  requestedAt: Date;
  processedAt: Date | null;
  rejectionReason: string | null;
  method: string | null;
}): PayoutDto {
  return {
    id: row.id,
    reference: row.reference ?? "",
    amount: moneyString(row.amount),
    currency: row.currency,
    status: row.status,
    requestedAt: row.requestedAt.toISOString(),
    processedAt: row.processedAt?.toISOString() ?? null,
    rejectionReason: row.rejectionReason,
    method: row.method ?? SIMULATED_PAYOUT_METHOD,
  };
}

function toAdminPayoutDto(
  row: NonNullable<Awaited<ReturnType<typeof payoutRepository.findByIdWithAdminInclude>>>,
): AdminPayoutDto {
  return {
    ...toPayoutDto(row),
    instructorName: row.instructor.name,
    instructorEmail: row.instructor.email,
    earningsCount: row._count.earnings,
    processedByName: row.processedBy?.name ?? null,
  };
}

// ---------------------------------------------------------------------------
// Instructor
// ---------------------------------------------------------------------------

/** The signed-in instructor's own payouts — identity comes from the session user, never from a request field. */
export async function getInstructorPayouts(instructor: SafeUser): Promise<PayoutDto[]> {
  assertInstructor(instructor);
  const rows = await payoutRepository.listForInstructor(instructor.id);
  return rows.map(toPayoutDto);
}

/**
 * Requests a (simulated) payout of the instructor's ENTIRE available
 * balance.
 *
 * Amount policy: full-balance withdrawal, not an arbitrary partial amount.
 * Earnings are discrete per-sale rows with fixed amounts, so an arbitrary
 * amount would require splitting earning rows (or a separate ledger);
 * withdrawing the whole available balance keeps the invariant
 *     payout.amount === SUM(netAmount of the reserved earnings)
 * exact, with no remainder to track. The client therefore never supplies an
 * amount that matters: `expectedAmount` is only the figure the instructor
 * SAW on screen, used to refuse the request if the balance has changed since
 * (a new sale, a refund, another request). The amount actually paid out is
 * always the server-computed sum.
 *
 * Concurrency: everything happens in ONE transaction that
 *   1. takes a row lock on the instructor's profile (serialises this
 *      instructor's payout requests — a concurrent duplicate waits here),
 *   2. reads AVAILABLE earnings under that lock,
 *   3. validates minimum / expected amount,
 *   4. creates the PENDING payout,
 *   5. reserves exactly those earnings with a conditional UPDATE
 *      (`WHERE status='AVAILABLE' AND payoutId IS NULL`) and requires the
 *      updated-row count to equal what was read — so even a refund racing
 *      this request cannot end with an earning both reversed and reserved.
 * The second concurrent request finds nothing AVAILABLE and is rejected.
 */
export async function requestPayout(
  instructor: SafeUser,
  input: { expectedAmount: string },
): Promise<PayoutDto> {
  assertInstructor(instructor);
  // Re-validated here (not only in the server function) so the service is safe on its own.
  const parsed = requestPayoutSchema.parse(input);
  const policy = getFinancePolicy();
  const expected = new Prisma.Decimal(parsed.expectedAmount);

  const payout = await prisma.$transaction(async (tx) => {
    const approvalStatus = await payoutRepository.lockInstructorProfileInTx(tx, instructor.id);
    if (approvalStatus !== "APPROVED") {
      throw new PayoutError(
        "NOT_APPROVED",
        "Payouts are available once an admin has approved your instructor account.",
      );
    }

    const available = await earningRepository.listAvailableInTx(tx, instructor.id);
    const total = sumDecimals(available.map((e) => e.netAmount));

    if (available.length === 0 || total.lte(0)) {
      throw new PayoutError("NO_BALANCE", "You have no available earnings to pay out.");
    }
    if (total.lt(policy.minimumPayoutAmount)) {
      throw new PayoutError(
        "BELOW_MINIMUM",
        `The minimum payout is $${moneyString(policy.minimumPayoutAmount)}. Your available balance is $${moneyString(total)}.`,
      );
    }
    if (!total.equals(expected)) {
      throw new PayoutError(
        "AMOUNT_MISMATCH",
        "Your available balance has changed since this page loaded. Please review the new amount and try again.",
      );
    }

    const created = await payoutRepository.createInTx(tx, {
      instructorId: instructor.id,
      amount: total,
      currency: PAYOUT_CURRENCY,
      method: SIMULATED_PAYOUT_METHOD,
      reference: generatePayoutReference(),
    });

    const reserved = await earningRepository.reserveInTx(tx, {
      earningIds: available.map((e) => e.id),
      instructorId: instructor.id,
      payoutId: created.id,
    });
    if (reserved.count !== available.length) {
      // Something changed the earnings between the read and the update (for
      // example a concurrent refund). Abort — the transaction rolls the
      // just-created payout back too.
      throw new PayoutError(
        "CONFLICT",
        "Your balance changed while the request was being processed. Please try again.",
      );
    }

    return created;
  });

  // Phase 11: after the reservation transaction committed. Best-effort + deduplicated.
  await notifyPayoutRequested({
    instructorId: instructor.id,
    payoutId: payout.id,
    reference: payout.reference ?? "",
    amount: moneyString(payout.amount),
    currency: payout.currency,
  });

  return toPayoutDto(payout);
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export async function getAdminPayouts(admin: SafeUser): Promise<AdminPayoutDto[]> {
  assertAdmin(admin);
  const rows = await payoutRepository.listAll();
  return rows.map(toAdminPayoutDto);
}

/**
 * Marks a PENDING payout PAID (simulated — no real funds move) and marks
 * every earning it reserved PAID, atomically. Verifies, inside the same
 * transaction, that the reserved earnings still add up to the payout amount
 * and all belong to the payout's instructor; any mismatch rolls back.
 */
export async function approvePayout(admin: SafeUser, payoutId: string): Promise<AdminPayoutDto> {
  assertAdmin(admin);
  await decidePayout(admin, payoutId, "PAID", null);
  const row = await loadAdminPayoutRow(payoutId);
  // Reached only if this request won the PENDING -> PAID transition.
  await notifyPayoutPaid({
    instructorId: row.instructorId,
    payoutId,
    reference: row.reference ?? "",
    amount: moneyString(row.amount),
    currency: row.currency,
  });
  return toAdminPayoutDto(row);
}

/** Rejects a PENDING payout and releases its earnings back to AVAILABLE, atomically. */
export async function rejectPayout(
  admin: SafeUser,
  payoutId: string,
  reason?: string | null | undefined,
): Promise<AdminPayoutDto> {
  assertAdmin(admin);
  const cleaned = reason?.trim() ? reason.trim().slice(0, 300) : null;
  await decidePayout(admin, payoutId, "REJECTED", cleaned);
  const row = await loadAdminPayoutRow(payoutId);
  await notifyPayoutRejected({
    instructorId: row.instructorId,
    payoutId,
    reference: row.reference ?? "",
    amount: moneyString(row.amount),
    currency: row.currency,
    // Only the admin's instructor-facing reason — nothing internal.
    reason: row.rejectionReason,
  });
  return toAdminPayoutDto(row);
}

async function loadAdminPayoutRow(payoutId: string) {
  const row = await payoutRepository.findByIdWithAdminInclude(payoutId);
  if (!row) throw new PayoutError("NOT_FOUND", "Payout not found.");
  return row;
}

async function decidePayout(
  admin: SafeUser,
  payoutId: string,
  next: "PAID" | "REJECTED",
  rejectionReason: string | null,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await payoutRepository.findByIdInTx(tx, payoutId);
    if (!existing) throw new PayoutError("NOT_FOUND", "Payout not found.");

    // Conditional PENDING -> next. The row lock this UPDATE takes serialises
    // a double-click / two admins; the loser matches 0 rows.
    const claimed = await payoutRepository.decidePendingInTx(tx, {
      payoutId,
      next,
      processedById: admin.id,
      rejectionReason,
    });
    if (claimed.count === 0) {
      throw new PayoutError("ALREADY_PROCESSED", "This payout has already been processed.");
    }

    // Integrity: what this payout reserved must be exactly what it says it pays.
    const reserved = await earningRepository.listByPayoutInTx(tx, payoutId);
    const total = sumDecimals(reserved.map((e) => e.netAmount));
    const consistent =
      reserved.length > 0 &&
      total.equals(existing.amount) &&
      reserved.every((e) => e.status === "RESERVED" && e.instructorId === existing.instructorId);
    if (!consistent) {
      throw new PayoutError(
        "INTEGRITY",
        "This payout's reserved earnings don't match its amount, so it can't be processed automatically.",
      );
    }

    const moved =
      next === "PAID"
        ? await earningRepository.markPaidForPayoutInTx(tx, payoutId)
        : await earningRepository.releaseForPayoutInTx(tx, payoutId);
    if (moved.count !== reserved.length) {
      throw new PayoutError(
        "INTEGRITY",
        "Payout earnings changed while processing. Nothing was saved.",
      );
    }
  });
}
