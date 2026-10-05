import { z } from "zod";

import { paginationFields, searchTermSchema } from "./pagination";

// Every schema is .strict() — unknown keys are rejected, and sort/filter
// values are closed enums, never free strings passed on to Prisma.

export const listAdminCoursesSchema = z
  .object({
    search: searchTermSchema,
    status: z.enum(["DRAFT", "PENDING_REVIEW", "PUBLISHED", "REJECTED", "ARCHIVED"]).optional(),
    categoryId: z.string().min(1).max(64).optional(),
    instructorId: z.string().min(1).max(64).optional(),
    ...paginationFields,
  })
  .strict();
export type ListAdminCoursesInput = z.infer<typeof listAdminCoursesSchema>;

export const listAdminInstructorsSchema = z
  .object({
    search: searchTermSchema,
    approvalStatus: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
    ...paginationFields,
  })
  .strict();
export type ListAdminInstructorsInput = z.infer<typeof listAdminInstructorsSchema>;

export const decideInstructorSchema = z
  .object({
    instructorId: z.string().min(1).max(64),
    decision: z.enum(["APPROVE", "REJECT"]),
    reason: z.string().trim().max(1000).optional(),
  })
  .strict()
  .refine((d) => d.decision !== "REJECT" || (d.reason && d.reason.length >= 5), {
    message: "Please give a reason (at least 5 characters) when rejecting.",
    path: ["reason"],
  });
export type DecideInstructorInput = z.infer<typeof decideInstructorSchema>;

export const listAdminEnrollmentsSchema = z
  .object({
    search: searchTermSchema,
    status: z.enum(["ACTIVE", "COMPLETED", "CANCELLED"]).optional(),
    courseId: z.string().min(1).max(64).optional(),
    ...paginationFields,
  })
  .strict();
export type ListAdminEnrollmentsInput = z.infer<typeof listAdminEnrollmentsSchema>;

export const listAdminReviewsSchema = z
  .object({
    search: searchTermSchema,
    courseId: z.string().min(1).max(64).optional(),
    rating: z.number().int().min(1).max(5).optional(),
    visibility: z.enum(["visible", "hidden"]).optional(),
    ...paginationFields,
  })
  .strict();
export type ListAdminReviewsInput = z.infer<typeof listAdminReviewsSchema>;

export const reviewVisibilitySchema = z
  .object({ reviewId: z.string().min(1).max(64), hidden: z.boolean() })
  .strict();

const categoryNameSchema = z.string().trim().min(2, "Name must be at least 2 characters").max(80);
const categoryDescriptionSchema = z.string().trim().max(500).optional();

export const createCategorySchema = z
  .object({ name: categoryNameSchema, description: categoryDescriptionSchema })
  .strict();
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = z
  .object({
    categoryId: z.string().min(1).max(64),
    name: categoryNameSchema.optional(),
    description: categoryDescriptionSchema,
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  })
  .strict();
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const listAdminCategoriesSchema = z
  .object({
    search: searchTermSchema,
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
    ...paginationFields,
  })
  .strict();
export type ListAdminCategoriesInput = z.infer<typeof listAdminCategoriesSchema>;

// ---------------------------------------------------------------------------
// Phase 15: admin users / students / payments
// ---------------------------------------------------------------------------

export const listAdminUsersSchema = z
  .object({
    search: searchTermSchema,
    role: z.enum(["STUDENT", "INSTRUCTOR", "ADMIN"]).optional(),
    status: z.enum(["ACTIVE", "SUSPENDED", "BANNED"]).optional(),
    sort: z.enum(["newest", "oldest"]).optional(),
    ...paginationFields,
  })
  .strict();
export type ListAdminUsersInput = z.infer<typeof listAdminUsersSchema>;

export const listAdminStudentsSchema = z
  .object({
    search: searchTermSchema,
    status: z.enum(["ACTIVE", "SUSPENDED", "BANNED"]).optional(),
    sort: z.enum(["newest", "oldest"]).optional(),
    ...paginationFields,
  })
  .strict();
export type ListAdminStudentsInput = z.infer<typeof listAdminStudentsSchema>;

/**
 * Account moderation. Only statuses the login + session guards actually
 * enforce (anything other than ACTIVE is refused at login and revokes the
 * session on next use). Role is deliberately NOT editable anywhere.
 */
export const setUserStatusSchema = z
  .object({
    userId: z.string().min(1).max(64),
    status: z.enum(["ACTIVE", "SUSPENDED", "BANNED"]),
  })
  .strict();
export type SetUserStatusInput = z.infer<typeof setUserStatusSchema>;

export const listAdminPaymentsSchema = z
  .object({
    /** Order number, buyer name or buyer email (contains, case-insensitive). */
    search: searchTermSchema,
    status: z.enum(["PENDING", "PAID", "FAILED", "REFUNDED", "PARTIALLY_REFUNDED"]).optional(),
    refund: z.enum(["refunded", "not_refunded"]).optional(),
    sort: z.enum(["newest", "oldest"]).optional(),
    ...paginationFields,
  })
  .strict();
export type ListAdminPaymentsInput = z.infer<typeof listAdminPaymentsSchema>;
