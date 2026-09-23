import { z } from "zod";

export const courseSlugForReviewSchema = z.object({
  courseSlug: z.string().trim().min(1, "Course is required"),
});

/**
 * Rating-only reviews are allowed (Review.comment is nullable in the
 * schema) — an empty/whitespace-only comment is normalized to
 * undefined rather than rejected. A comment that IS provided still
 * needs a few real characters; nobody benefits from a one-character
 * review.
 */
export const reviewInputSchema = z.object({
  rating: z.number().int().min(1, "Rating must be 1-5").max(5, "Rating must be 1-5"),
  comment: z
    .string()
    .trim()
    .max(3000, "Keep your review under 3000 characters")
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined))
    .refine((v) => v === undefined || v.length >= 3, {
      message: "Say a little more, or leave the review blank",
    }),
});

export const reviewIdSchema = z.object({
  reviewId: z.string().trim().min(1, "Review is required"),
});

export const updateReviewSchema = reviewIdSchema.extend(reviewInputSchema.shape);
