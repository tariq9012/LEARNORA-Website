/** Phase 12 DTOs — reporting, moderation, notification preferences. Never raw Prisma rows. */

export type ReportReasonDto = "SPAM" | "HARASSMENT" | "INAPPROPRIATE" | "MISLEADING" | "OTHER";
export type ReportStatusDto = "OPEN" | "IN_REVIEW" | "RESOLVED" | "DISMISSED";
export type ReportTargetTypeDto = "REVIEW" | "MESSAGE";
export type ReportActionDto = "REVIEW_HIDDEN" | "REVIEW_RESTORED" | "MESSAGE_REMOVED";

/** Captured at report time so a later edit/deletion of the message can't erase moderation context. Never contains other messages. */
export type ReportedMessageSnapshot = {
  content: string;
  senderName: string;
  senderRole: "STUDENT" | "INSTRUCTOR";
  conversationId: string;
  courseTitle: string | null;
  sentAt: string;
};

/** The reporting user's own report — no admin note, no other party's identity beyond what they already knew. */
export type MyReportDto = {
  id: string;
  targetType: ReportTargetTypeDto;
  reason: ReportReasonDto;
  status: ReportStatusDto;
  createdAt: string;
  resolvedAt: string | null;
};

/** Admin moderation-queue row. */
export type AdminReportDto = {
  id: string;
  targetType: ReportTargetTypeDto;
  targetId: string;
  reason: ReportReasonDto;
  details: string | null;
  status: ReportStatusDto;
  reporterName: string;
  /** A short, safe label for what was reported — a review excerpt or "Message in <course>". Never the full private thread. */
  targetSummary: string;
  createdAt: string;
};

export type AdminReportListDto = {
  reports: AdminReportDto[];
  total: number;
  page: number;
  pageSize: number;
};

/** Admin report detail — a REVIEW report includes the live review (still visible unless hidden); a MESSAGE report includes ONLY the snapshot. */
export type AdminReportDetailDto = AdminReportDto & {
  action: ReportActionDto | null;
  adminNote: string | null;
  resolvedByName: string | null;
  review: {
    id: string;
    courseTitle: string;
    authorName: string;
    rating: number;
    comment: string | null;
    hidden: boolean;
  } | null;
  message: ReportedMessageSnapshot | null;
};

export type NotificationPreferencesDto = {
  courseUpdates: boolean;
  payments: boolean;
  refunds: boolean;
  payouts: boolean;
  messages: boolean;
  certificates: boolean;
  moderation: boolean;
};
