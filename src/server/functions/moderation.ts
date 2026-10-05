import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { ForbiddenError, UnauthorizedError, requireAdmin, requireAnyRole } from "../auth/guards";
import { RateLimitExceededError } from "../auth/rate-limit";
import {
  ModerationError,
  dismissReport,
  getAdminReportDetail,
  getAdminReports,
  resolveReport,
} from "../services/moderation-service";
import { ReportError, getMyReports, reportMessage, reportReview } from "../services/report-service";
import {
  dismissReportSchema,
  listAdminReportsSchema,
  reportIdSchema,
  reportMessageSchema,
  reportReviewSchema,
  resolveReportSchema,
} from "../validation/moderation";
import type { AdminReportDetailDto, AdminReportListDto, MyReportDto } from "../dto/moderation";

/**
 * Reporting + admin moderation server functions (Phase 12). Reporter and
 * admin identity always come from the session; the strict Zod schemas reject
 * a client-supplied id for either. createServerFn keeps the framework's CSRF
 * protection on every mutation.
 */

const REPORTING_ROLES = ["STUDENT", "INSTRUCTOR"] as const;

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

function toActionError(error: unknown): { success: false; error: string } {
  if (error instanceof z.ZodError)
    return { success: false, error: error.issues[0]?.message ?? "Invalid input." };
  if (error instanceof UnauthorizedError)
    return { success: false, error: "Please log in to continue." };
  if (error instanceof ForbiddenError)
    return { success: false, error: "You don't have permission to do that." };
  if (error instanceof RateLimitExceededError) return { success: false, error: error.message };
  if (error instanceof ReportError || error instanceof ModerationError)
    return { success: false, error: error.message };
  console.error("[moderation] unexpected error", error);
  return { success: false, error: "Something went wrong. Please try again." };
}

// -- Reporting (student/instructor) -----------------------------------------

export const reportReviewFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => reportReviewSchema.parse(data))
  .handler(async ({ data }): Promise<ActionResult<null>> => {
    try {
      const user = await requireAnyRole(REPORTING_ROLES);
      await reportReview(user, data);
      return { success: true, data: null };
    } catch (error) {
      return toActionError(error);
    }
  });

export const reportMessageFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => reportMessageSchema.parse(data))
  .handler(async ({ data }): Promise<ActionResult<null>> => {
    try {
      const user = await requireAnyRole(REPORTING_ROLES);
      await reportMessage(user, data);
      return { success: true, data: null };
    } catch (error) {
      return toActionError(error);
    }
  });

export const getMyReportsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<MyReportDto[]> => {
    const user = await requireAnyRole(REPORTING_ROLES);
    return getMyReports(user);
  },
);

// -- Admin moderation ---------------------------------------------------------

export const getAdminReportsFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => listAdminReportsSchema.parse(data ?? {}))
  .handler(async ({ data }): Promise<AdminReportListDto> => {
    const admin = await requireAdmin();
    return getAdminReports(admin, data);
  });

export const getAdminReportFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => reportIdSchema.parse(data))
  .handler(async ({ data }): Promise<ActionResult<AdminReportDetailDto>> => {
    try {
      const admin = await requireAdmin();
      return { success: true, data: await getAdminReportDetail(admin, data.reportId) };
    } catch (error) {
      return toActionError(error);
    }
  });

export const resolveReportFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => resolveReportSchema.parse(data))
  .handler(async ({ data }): Promise<ActionResult<null>> => {
    try {
      const admin = await requireAdmin();
      await resolveReport(admin, data);
      return { success: true, data: null };
    } catch (error) {
      return toActionError(error);
    }
  });

export const dismissReportFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => dismissReportSchema.parse(data))
  .handler(async ({ data }): Promise<ActionResult<null>> => {
    try {
      const admin = await requireAdmin();
      await dismissReport(admin, data);
      return { success: true, data: null };
    } catch (error) {
      return toActionError(error);
    }
  });
