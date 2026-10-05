import { ForbiddenError } from "../auth/guards";
import * as reviewRepository from "../repositories/review-repository";
import { notifyReviewHidden } from "./notification-events";
import { resolvePagination } from "../validation/pagination";
import { listAdminReviewsSchema, reviewVisibilitySchema } from "../validation/admin";
import { listInstructorReviewsSchema } from "../validation/instructor-analytics";
import type { SafeUser } from "../auth/types";
import type { AdminReviewListDTO, InstructorReviewListDTO } from "../dto/admin";

export class ReviewAdminError extends Error {}

type Row = Awaited<ReturnType<typeof reviewRepository.listReviewsForListing>>[number];

const toBase = (r: Row) => ({
  id: r.id,
  courseId: r.courseId,
  courseTitle: r.course.title,
  reviewerName: r.user.name,
  rating: r.rating,
  comment: r.comment,
  createdAt: r.createdAt.toISOString(),
  hidden: r.hiddenAt !== null,
});

export async function listAdminReviews(
  admin: SafeUser,
  input: unknown,
): Promise<AdminReviewListDTO> {
  if (admin.role !== "ADMIN") throw new ForbiddenError("Only admins can do that.");
  const parsed = listAdminReviewsSchema.parse(input ?? {});
  const { page, pageSize, skip, take } = resolvePagination(parsed);
  const filters: reviewRepository.ReviewListFilters = {
    ...(parsed.search && { search: parsed.search }),
    ...(parsed.courseId && { courseId: parsed.courseId }),
    ...(parsed.rating && { rating: parsed.rating }),
    ...(parsed.visibility && { visibility: parsed.visibility }),
  };
  const [rows, total] = await Promise.all([
    reviewRepository.listReviewsForListing(filters, skip, take),
    reviewRepository.countReviewsForListing(filters),
  ]);
  return { reviews: rows.map(toBase), total, page, pageSize };
}

/**
 * Direct hide/restore from the admin reviews page. Reuses the exact
 * Phase 12 repository functions the report-resolution flow uses
 * (hideReview / restoreReview), so a hidden review is excluded from every
 * public list and rating aggregate by the same mechanism — this is not a
 * second moderation system. Both are conditional updates, so repeating
 * an action is a harmless no-op.
 */
export async function setReviewHidden(admin: SafeUser, input: unknown): Promise<void> {
  if (admin.role !== "ADMIN") throw new ForbiddenError("Only admins can do that.");
  const data = reviewVisibilitySchema.parse(input);

  const review = await reviewRepository.findByIdForModeration(data.reviewId);
  if (!review) throw new ReviewAdminError("Review not found.");

  if (data.hidden) {
    const result = await reviewRepository.hideReview(review.id);
    if (result.count > 0) {
      await notifyReviewHidden({
        ownerId: review.userId,
        reportId: `direct:${review.id}:${Date.now()}`,
        courseTitle: review.course.title,
      });
    }
  } else {
    await reviewRepository.restoreReview(review.id);
  }
}

/**
 * The signed-in instructor's own course reviews — observational only.
 * Ownership is in the query (course.instructorId = session user). The
 * DTO carries the hidden flag but no report, reason or admin-note data,
 * and there is no mutation exported for instructors.
 */
export async function listInstructorReviews(
  instructor: SafeUser,
  input: unknown,
): Promise<InstructorReviewListDTO> {
  if (instructor.role !== "INSTRUCTOR") throw new ForbiddenError("Only instructors can do that.");
  const parsed = listInstructorReviewsSchema.parse(input ?? {});
  const { page, pageSize, skip, take } = resolvePagination(parsed);
  const filters: reviewRepository.ReviewListFilters = {
    instructorId: instructor.id,
    ...(parsed.courseId && { courseId: parsed.courseId }),
    ...(parsed.rating && { rating: parsed.rating }),
    ...(parsed.order && { order: parsed.order }),
  };
  const [rows, total] = await Promise.all([
    reviewRepository.listReviewsForListing(filters, skip, take),
    reviewRepository.countReviewsForListing(filters),
  ]);
  return { reviews: rows.map(toBase), total, page, pageSize };
}
