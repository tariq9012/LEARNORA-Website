import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { ForbiddenError, UnauthorizedError, requireInstructor } from "../auth/guards";
import { requireApprovedInstructor } from "../auth/instructor-guard";
import { getInstructorEarnings, getInstructorEarningsSummary } from "../services/earnings-service";
import { PayoutError, getInstructorPayouts, requestPayout } from "../services/payout-service";
import { requestPayoutSchema } from "../validation/finance";
import type {
  InstructorEarningsDto,
  InstructorEarningsSummaryDto,
  PayoutDto,
} from "../dto/earnings";

/**
 * Instructor-facing earnings/payout server functions (Phase 10).
 *
 * Identity for every one of these comes from the authenticated session
 * (requireInstructor / requireApprovedInstructor) — none of them accepts an
 * instructorId, so one instructor can never ask for another's data. They are
 * createServerFn handlers, so they keep TanStack Start's built-in CSRF
 * protection for state-changing calls.
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
    return { success: false, error: error.message };
  }
  if (error instanceof PayoutError) {
    return { success: false, error: error.message };
  }
  console.error("[earnings] unexpected error", error);
  return { success: false, error: "Something went wrong. Please try again." };
}

/** Summary only — used by the instructor dashboard. Any INSTRUCTOR may view their OWN figures (a pending instructor simply sees zeros). */
export const getInstructorEarningsSummaryFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<InstructorEarningsSummaryDto> => {
    const instructor = await requireInstructor();
    return getInstructorEarningsSummary(instructor);
  },
);

/** Summary + recent earning history + monthly chart for /instructor/earnings. */
export const getInstructorEarningsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<InstructorEarningsDto> => {
    const instructor = await requireInstructor();
    return getInstructorEarnings(instructor);
  },
);

/** The signed-in instructor's own payout history. */
export const getInstructorPayoutsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<PayoutDto[]> => {
    const instructor = await requireInstructor();
    return getInstructorPayouts(instructor);
  },
);

/**
 * Requests a simulated payout of the instructor's whole available balance.
 * `expectedAmount` is only the figure the instructor saw (see
 * payout-service.ts) — the amount paid out is always server-computed.
 */
export const requestPayoutFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => requestPayoutSchema.parse(data))
  .handler(async ({ data }): Promise<ActionResult<PayoutDto>> => {
    try {
      // Role check first so a student/admin gets the generic "no permission"
      // answer; then the approval check with a payout-specific message.
      const instructor = await requireInstructor();
      try {
        await requireApprovedInstructor();
      } catch (error) {
        if (error instanceof ForbiddenError) {
          throw new PayoutError(
            "NOT_APPROVED",
            "Payouts are available once an admin has approved your instructor account.",
          );
        }
        throw error;
      }
      const payout = await requestPayout(instructor, { expectedAmount: data.expectedAmount });
      return { success: true, data: payout };
    } catch (error) {
      return toActionError(error);
    }
  });
