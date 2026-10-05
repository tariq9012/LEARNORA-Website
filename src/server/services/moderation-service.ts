import { prisma } from "../db/client";
import { ForbiddenError } from "../auth/guards";
import * as reportRepository from "../repositories/report-repository";
import * as reviewRepository from "../repositories/review-repository";
import * as conversationRepository from "../repositories/conversation-repository";
import {
  listAdminReportsSchema,
  resolveReportSchema,
  dismissReportSchema,
  reportIdSchema,
} from "../validation/moderation";
import {
  notifyReportDismissed,
  notifyReportResolved,
  notifyReviewHidden,
} from "./notification-events";
import { publishCommEvent } from "./realtime-service";
import type { SafeUser } from "../auth/types";
import type {
  AdminReportDetailDto,
  AdminReportDto,
  AdminReportListDto,
  ReportedMessageSnapshot,
} from "../dto/moderation";
import type { Prisma } from "../../generated/prisma/client";

/**
 * Admin moderation (Phase 12): the report queue, report detail, and the two
 * decisions an admin can make (resolve with an action, or dismiss). Every
 * function requires ADMIN — checked here in addition to the server function's
 * requireAdmin(), so the service is safe even if it's ever called elsewhere.
 *
 * PRIVACY BOUNDARY (unchanged from Phase 11): a MESSAGE report gives the
 * admin ONLY the immutable snapshot captured at report time — never a
 * "view conversation" feature, never the surrounding thread. There is no
 * server function anywhere that lets an admin browse a conversation by id.
 */

const DEFAULT_PAGE_SIZE = 20;

function assertAdmin(user: SafeUser) {
  if (user.role !== "ADMIN") throw new ForbiddenError("Only admins can do that.");
}

function summaryFromReview(review: { comment: string | null } | null): string {
  if (!review) return "Review (no longer available)";
  const text = (review.comment ?? "").trim();
  return text ? (text.length > 80 ? `${text.slice(0, 79)}…` : text) : "Review (no comment)";
}

function summaryFromSnapshot(snapshot: unknown): string {
  const s = snapshot as ReportedMessageSnapshot | null;
  if (!s) return "Message (snapshot unavailable)";
  return s.courseTitle ? `Message in “${s.courseTitle}”` : "Message";
}

async function toAdminReportDto(
  row: Awaited<ReturnType<typeof reportRepository.listForAdmin>>[number],
): Promise<AdminReportDto> {
  let targetSummary = "";
  if (row.targetType === "REVIEW") {
    const review = await reviewRepository.findByIdForModeration(row.targetId);
    targetSummary = summaryFromReview(review);
  } else {
    // The snapshot (captured at report time) is enough — no live message lookup needed, or possible, from a queue row.
    const full = await reportRepository.findRawById(row.id);
    targetSummary = summaryFromSnapshot(full?.contentSnapshot);
  }
  return {
    id: row.id,
    // Reporting is scoped to REVIEW/MESSAGE only (see report-repository.create).
    targetType: row.targetType as AdminReportDto["targetType"],
    targetId: row.targetId,
    reason: row.reason,
    details: row.details,
    status: row.status,
    reporterName: row.reporter.name,
    targetSummary,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getAdminReports(
  admin: SafeUser,
  input: unknown,
): Promise<AdminReportListDto> {
  assertAdmin(admin);
  const filters = listAdminReportsSchema.parse(input ?? {});
  const page = filters.page ?? 1;
  const pageSize = Math.min(filters.pageSize ?? DEFAULT_PAGE_SIZE, 50);

  const where: Prisma.ReportWhereInput = {
    ...(filters.status && { status: filters.status }),
    ...(filters.targetType && { targetType: filters.targetType }),
    ...(filters.reason && { reason: filters.reason }),
  };

  const [rows, total] = await Promise.all([
    reportRepository.listForAdmin(where, { skip: (page - 1) * pageSize, take: pageSize }),
    reportRepository.countForAdmin(where),
  ]);

  return { reports: await Promise.all(rows.map(toAdminReportDto)), total, page, pageSize };
}

export async function getAdminReportDetail(
  admin: SafeUser,
  reportId: string,
): Promise<AdminReportDetailDto> {
  assertAdmin(admin);
  const row = await reportRepository.findByIdForAdmin(reportId);
  if (!row) throw new ModerationError("NOT_FOUND", "Report not found.");

  const base = await toAdminReportDto(row);
  let review: AdminReportDetailDto["review"] = null;
  let message: AdminReportDetailDto["message"] = null;

  if (row.targetType === "REVIEW") {
    const full = await reviewRepository.findByIdForModeration(row.targetId);
    if (full) {
      review = {
        id: full.id,
        courseTitle: full.course.title,
        authorName: full.user.name,
        rating: full.rating,
        comment: full.comment,
        hidden: full.hiddenAt !== null,
      };
    }
  } else {
    // ONLY the snapshot — never a live conversation fetch.
    message = (row.contentSnapshot as ReportedMessageSnapshot | null) ?? null;
  }

  return {
    ...base,
    action: row.action,
    adminNote: row.adminNote,
    resolvedByName: row.resolvedBy?.name ?? null,
    review,
    message,
  };
}

export type ModerationErrorCode = "NOT_FOUND" | "ALREADY_DECIDED" | "INVALID_ACTION";

export class ModerationError extends Error {
  readonly code: ModerationErrorCode;
  constructor(code: ModerationErrorCode, message: string) {
    super(message);
    this.name = "ModerationError";
    this.code = code;
  }
}

/** Dismisses an OPEN/IN_REVIEW report: no action is taken on the content. Notifies the reporter (best-effort, deduplicated). */
export async function dismissReport(admin: SafeUser, input: unknown): Promise<void> {
  assertAdmin(admin);
  const data = dismissReportSchema.parse(input);
  const report = await reportRepository.findRawById(data.reportId);
  if (!report) throw new ModerationError("NOT_FOUND", "Report not found.");

  const claim = await prisma.$transaction((tx) =>
    reportRepository.decideInTx(tx, {
      reportId: data.reportId,
      status: "DISMISSED",
      action: null,
      adminNote: data.adminNote ?? null,
      adminId: admin.id,
    }),
  );
  if (claim.count === 0)
    throw new ModerationError("ALREADY_DECIDED", "This report has already been reviewed.");

  await notifyReportDismissed({
    reporterId: report.reporterId,
    reportId: report.id,
    targetLabel: report.targetType === "REVIEW" ? "a review" : "a message",
  });
  publishCommEvent(report.reporterId, "notification_changed");
}

/**
 * Resolves an OPEN/IN_REVIEW report with an action. NO_ACTION resolves
 * without touching the content (e.g. "reviewed, nothing wrong here, but
 * marking it handled" — distinct from DISMISS which records "not a genuine
 * violation"). REVIEW_HIDDEN/REVIEW_RESTORED and MESSAGE_REMOVED perform the
 * actual moderation action, conditionally (so a report can't be double-acted
 * on), then notify the affected party.
 */
export async function resolveReport(admin: SafeUser, input: unknown): Promise<void> {
  assertAdmin(admin);
  const data = resolveReportSchema.parse(input);
  const report = await reportRepository.findRawById(data.reportId);
  if (!report) throw new ModerationError("NOT_FOUND", "Report not found.");

  if (data.action === "REVIEW_HIDDEN" || data.action === "REVIEW_RESTORED") {
    if (report.targetType !== "REVIEW")
      throw new ModerationError("INVALID_ACTION", "This action only applies to review reports.");
  }
  if (data.action === "MESSAGE_REMOVED" && report.targetType !== "MESSAGE") {
    throw new ModerationError("INVALID_ACTION", "This action only applies to message reports.");
  }

  const claim = await prisma.$transaction((tx) =>
    reportRepository.decideInTx(tx, {
      reportId: data.reportId,
      status: "RESOLVED",
      action: data.action === "NO_ACTION" ? null : data.action,
      adminNote: data.adminNote ?? null,
      adminId: admin.id,
    }),
  );
  if (claim.count === 0)
    throw new ModerationError("ALREADY_DECIDED", "This report has already been reviewed.");

  if (data.action === "REVIEW_HIDDEN") {
    const result = await reviewRepository.hideReview(report.targetId);
    if (result.count > 0) {
      const review = await reviewRepository.findByIdForModeration(report.targetId);
      if (review) {
        await notifyReviewHidden({
          ownerId: review.userId,
          reportId: report.id,
          courseTitle: review.course.title,
        });
      }
    }
  } else if (data.action === "REVIEW_RESTORED") {
    await reviewRepository.restoreReview(report.targetId);
  } else if (data.action === "MESSAGE_REMOVED") {
    const result = await conversationRepository.markMessageRemoved(report.targetId);
    if (result.count > 0) {
      const message = await conversationRepository.findMessageForReport(report.targetId);
      if (message)
        publishCommEvent(
          message.conversation.participants.map((p) => p.userId),
          "message_changed",
        );
    }
  }

  await notifyReportResolved({
    reporterId: report.reporterId,
    reportId: report.id,
    targetLabel: report.targetType === "REVIEW" ? "a review" : "a message",
  });
  publishCommEvent(report.reporterId, "notification_changed");
}
