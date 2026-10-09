import { Prisma } from "../../generated/prisma/client";
import { enforceRateLimit } from "../auth/rate-limit";
import * as conversationRepository from "../repositories/conversation-repository";
import * as reportRepository from "../repositories/report-repository";
import * as reviewRepository from "../repositories/review-repository";
import { reportMessageSchema, reportReviewSchema } from "../validation/moderation";
import { publishCommEvent } from "./realtime-service";
import type { SafeUser } from "../auth/types";
import type { MyReportDto, ReportedMessageSnapshot } from "../dto/moderation";

/**
 * User-facing reporting (Phase 12): a STUDENT or INSTRUCTOR reports a review
 * or a message. Reporter identity is always the session user — the strict
 * Zod schemas reject a smuggled `reporterId`, and nothing here accepts one as
 * a parameter.
 */

export type ReportErrorCode = "TARGET_NOT_FOUND" | "OWN_CONTENT" | "NOT_PARTICIPANT" | "DUPLICATE";

export class ReportError extends Error {
  readonly code: ReportErrorCode;
  constructor(code: ReportErrorCode, message: string) {
    super(message);
    this.name = "ReportError";
    this.code = code;
  }
}

const REPORT_RATE_LIMIT = { limit: 10, windowMs: 60 * 60_000 } as const; // 10/hour/user

function toMyReportDto(
  row: Awaited<ReturnType<typeof reportRepository.listForReporter>>[number],
): MyReportDto {
  return {
    id: row.id,
    // Reporting is scoped to REVIEW/MESSAGE only (see report-repository.create); the
    // schema's ReportTargetType enum predates Phase 12 and also allows COURSE/USER,
    // which this service never creates or reads.
    targetType: row.targetType as MyReportDto["targetType"],
    reason: row.reason,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  };
}

async function createReport(
  reporterId: string,
  targetType: "REVIEW" | "MESSAGE",
  targetId: string,
  input: { reason: string; details?: string | undefined },
  contentSnapshot?: Prisma.InputJsonValue,
): Promise<void> {
  try {
    await reportRepository.create({
      reporterId,
      targetType,
      targetId,
      reason: input.reason as never,
      details: input.details ?? null,
      ...(contentSnapshot !== undefined && { contentSnapshot }),
    });
  } catch (error) {
    // The partial unique index (reporterId, targetType, targetId WHERE status IN OPEN/IN_REVIEW)
    // is the real duplicate guard — this is a friendly message for the race/double-click case.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ReportError(
        "DUPLICATE",
        "You've already reported this — our team is looking into it.",
      );
    }
    throw error;
  }
}

/** A user reports a review. Cannot report your own review; cannot duplicate an already-open report. */
export async function reportReview(user: SafeUser, input: unknown): Promise<void> {
  const data = reportReviewSchema.parse(input);
  await enforceRateLimit(`report:${user.id}`, REPORT_RATE_LIMIT.limit, REPORT_RATE_LIMIT.windowMs);

  const review = await reviewRepository.findReviewById(data.reviewId);
  if (!review) throw new ReportError("TARGET_NOT_FOUND", "Review not found.");
  if (review.userId === user.id)
    throw new ReportError("OWN_CONTENT", "You can't report your own review.");

  await createReport(user.id, "REVIEW", data.reviewId, data);
  publishCommEvent(await adminUserIds(), "report_changed");
}

/**
 * A participant reports a message. Never own message; never a message
 * outside a conversation you belong to — knowing the id is not enough.
 * Captures an immutable snapshot (sender, text, course, timestamp) so a
 * later edit/removal of the message can't erase the moderation evidence.
 */
export async function reportMessage(user: SafeUser, input: unknown): Promise<void> {
  const data = reportMessageSchema.parse(input);
  await enforceRateLimit(`report:${user.id}`, REPORT_RATE_LIMIT.limit, REPORT_RATE_LIMIT.windowMs);

  const message = await conversationRepository.findMessageForReport(data.messageId);
  if (!message) throw new ReportError("TARGET_NOT_FOUND", "Message not found.");
  const isParticipant = message.conversation.participants.some((p) => p.userId === user.id);
  if (!isParticipant) throw new ReportError("TARGET_NOT_FOUND", "Message not found.");
  if (message.senderId === user.id)
    throw new ReportError("OWN_CONTENT", "You can't report your own message.");

  const snapshot: ReportedMessageSnapshot = {
    content: message.content,
    senderName: message.sender.name,
    senderRole: message.sender.role === "INSTRUCTOR" ? "INSTRUCTOR" : "STUDENT",
    conversationId: message.conversationId,
    courseTitle: message.conversation.course?.title ?? null,
    sentAt: message.createdAt.toISOString(),
  };

  await createReport(
    user.id,
    "MESSAGE",
    data.messageId,
    data,
    snapshot as unknown as Prisma.InputJsonValue,
  );
  publishCommEvent(await adminUserIds(), "report_changed");
}

export async function getMyReports(user: SafeUser): Promise<MyReportDto[]> {
  const rows = await reportRepository.listForReporter(user.id);
  return rows.map(toMyReportDto);
}

/** Every admin's id — reports are visible to any admin, so all of them get a light SSE hint. Small table; a plain query is fine. */
async function adminUserIds(): Promise<string[]> {
  const { prisma } = await import("../db/client");
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  return admins.map((a) => a.id);
}
