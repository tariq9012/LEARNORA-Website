import { z } from "zod";

/** Phase 12 input schemas (reporting, moderation, preferences). Strict — an unexpected field (a tampered reporterId, status, action) is rejected. */

const recordId = (label: string) =>
  z
    .string({ required_error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(64, `${label} is invalid`)
    .regex(/^[A-Za-z0-9_-]+$/, `${label} is invalid`);

export const REPORT_REASONS = [
  "SPAM",
  "HARASSMENT",
  "INAPPROPRIATE",
  "MISLEADING",
  "OTHER",
] as const;
export const MAX_REPORT_DETAILS = 500;
export const MAX_ADMIN_NOTE = 500;

const reportReasonSchema = z.enum(REPORT_REASONS);

const baseReportSchema = z.object({
  reason: reportReasonSchema,
  details: z
    .string()
    .trim()
    .max(MAX_REPORT_DETAILS, `Details must be ${MAX_REPORT_DETAILS} characters or fewer.`)
    .optional(),
});

export const reportReviewSchema = baseReportSchema
  .extend({ reviewId: recordId("Review") })
  .strict();

export const reportMessageSchema = baseReportSchema
  .extend({ messageId: recordId("Message") })
  .strict();

export const listAdminReportsSchema = z
  .object({
    status: z.enum(["OPEN", "IN_REVIEW", "RESOLVED", "DISMISSED"]).optional(),
    targetType: z.enum(["REVIEW", "MESSAGE"]).optional(),
    reason: reportReasonSchema.optional(),
    page: z.number().int().min(1).max(1000).optional(),
    pageSize: z.number().int().min(1).max(50).optional(),
  })
  .strict();

export const reportIdSchema = z.object({ reportId: recordId("Report") }).strict();

export const dismissReportSchema = z
  .object({
    reportId: recordId("Report"),
    adminNote: z.string().trim().max(MAX_ADMIN_NOTE).optional(),
  })
  .strict();

export const resolveReportSchema = z
  .object({
    reportId: recordId("Report"),
    // What the admin chooses to do about the reported content.
    action: z.enum(["REVIEW_HIDDEN", "REVIEW_RESTORED", "MESSAGE_REMOVED", "NO_ACTION"]),
    adminNote: z.string().trim().max(MAX_ADMIN_NOTE).optional(),
  })
  .strict();

export const updateNotificationPreferencesSchema = z
  .object({
    courseUpdates: z.boolean().optional(),
    payments: z.boolean().optional(),
    refunds: z.boolean().optional(),
    payouts: z.boolean().optional(),
    messages: z.boolean().optional(),
    certificates: z.boolean().optional(),
    moderation: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Provide at least one preference to update.");
