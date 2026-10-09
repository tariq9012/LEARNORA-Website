import { initialsOf, formatMonthYear } from "@/lib/format";

import { Prisma } from "../../generated/prisma/client";
import * as reviewRepository from "../repositories/review-repository";
import * as enrollmentRepository from "../repositories/enrollment-repository";
import * as courseRepository from "../repositories/course-repository";
import { isEnrollmentEntitled } from "./enrollment-policy";
import type { SafeUser } from "../auth/types";
import type { ReviewDTO, MyReviewStateDTO } from "../dto/review";
import { enforceRateLimit } from "../auth/rate-limit";
import { reviewInputSchema } from "../validation/review";

export type RatingBreakdown = { stars: number; pct: number };

export class ReviewError extends Error {}
export class CourseNotAvailableForReviewError extends ReviewError {
  constructor() {
    super("This course isn't available for review.");
  }
}
export class NotEligibleToReviewError extends ReviewError {
  constructor() {
    super("Enroll in this course to leave a review.");
  }
}
export class AlreadyReviewedError extends ReviewError {
  constructor() {
    super("You've already reviewed this course — edit your existing review instead.");
  }
}
export class ReviewNotFoundError extends ReviewError {
  constructor() {
    super("Review not found.");
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

type ReviewRow = Awaited<ReturnType<typeof reviewRepository.findReviewsForCourse>>[number];

function mapReviewRowToDTO(review: ReviewRow): ReviewDTO {
  return {
    id: review.id,
    author: review.user.name,
    initials: initialsOf(review.user.name),
    role: review.user.studentProfile?.headline || "Student",
    rating: review.rating,
    date: formatMonthYear(review.createdAt),
    body: review.comment ?? "",
  };
}

export async function getReviewsForCourse(courseId: string): Promise<ReviewDTO[]> {
  const rows = await reviewRepository.findReviewsForCourse(courseId);
  return rows.map(mapReviewRowToDTO);
}

/** Percentage of reviews at each star rating (5 down to 1), computed from every review on the course. */
export async function getRatingBreakdown(courseId: string): Promise<RatingBreakdown[]> {
  const ratings = await reviewRepository.findAllRatingsForCourse(courseId);
  const total = ratings.length;
  return [5, 4, 3, 2, 1].map((stars) => {
    const count = ratings.filter((r) => r.rating === stars).length;
    return { stars, pct: total > 0 ? Math.round((count / total) * 100) : 0 };
  });
}

// ---------------------------------------------------------------------------
// Review eligibility + CRUD (Phase 8)
// ---------------------------------------------------------------------------

/**
 * Review eligibility policy: an ACTIVE or COMPLETED (i.e. currently
 * entitled — see enrollment-policy.ts) enrollment in a PUBLISHED course
 * is enough to review; you don't have to finish a course to say
 * something useful about it. This is a deliberate choice over
 * "COMPLETED only": the mock UI's "Review course" label only appeared
 * after completion, but that was never backed by a real eligibility
 * check, and requiring full completion first is unusually strict for
 * an LMS review feature (most platforms allow reviewing while
 * enrolled). A CANCELLED enrollment is never entitled, matching the
 * Phase 7 hardening.
 */
async function getEntitledEnrollment(userId: string, courseId: string) {
  const enrollment = await enrollmentRepository.findEnrollment(userId, courseId);
  return enrollment && isEnrollmentEntitled(enrollment.status) ? enrollment : null;
}

/** Drives the review form on the course detail page — never trusts a client-asserted eligibility flag. */
export async function getMyCourseReview(
  user: SafeUser | null,
  courseSlug: string,
): Promise<MyReviewStateDTO> {
  if (!user || user.role !== "STUDENT") {
    return { state: "not_eligible", reason: "Log in as a student to leave a review." };
  }

  const course = await courseRepository.findCourseBySlugForLearning(courseSlug);
  if (!course || course.status !== "PUBLISHED") {
    return { state: "not_eligible", reason: "This course isn't available for review." };
  }

  const enrollment = await getEntitledEnrollment(user.id, course.id);
  if (!enrollment) {
    return { state: "not_eligible", reason: "Enroll in this course to leave a review." };
  }

  const existing = await reviewRepository.findReviewByUserAndCourse(user.id, course.id);
  if (existing) return { state: "already_reviewed", review: mapReviewRowToDTO(existing) };

  return { state: "can_review" };
}

export async function createCourseReview(
  user: SafeUser,
  courseSlug: string,
  input: unknown,
): Promise<ReviewDTO> {
  const data = reviewInputSchema.parse(input);
  await enforceRateLimit(`review:${user.id}`, 30, 60 * 60 * 1000);

  const course = await courseRepository.findCourseBySlugForLearning(courseSlug);
  if (!course || course.status !== "PUBLISHED") throw new CourseNotAvailableForReviewError();

  const enrollment = await getEntitledEnrollment(user.id, course.id);
  if (!enrollment) throw new NotEligibleToReviewError();

  try {
    const created = await reviewRepository.createReview({
      userId: user.id,
      courseId: course.id,
      rating: data.rating,
      comment: data.comment ?? null,
    });
    return mapReviewRowToDTO(created);
  } catch (error) {
    // The @@unique([userId, courseId]) constraint is the real guard —
    // the eligibility check above is for a clean error message, not a
    // substitute for it (a concurrent request could still race past it).
    if (isUniqueConstraintError(error)) throw new AlreadyReviewedError();
    throw error;
  }
}

export async function updateCourseReview(
  user: SafeUser,
  reviewId: string,
  input: unknown,
): Promise<ReviewDTO> {
  const data = reviewInputSchema.parse(input);
  await enforceRateLimit(`review:${user.id}`, 30, 60 * 60 * 1000);

  const review = await reviewRepository.findReviewById(reviewId);
  // Same "not found" for missing vs. not-yours — never confirm another
  // student's review exists to the caller.
  if (!review || review.userId !== user.id) throw new ReviewNotFoundError();

  const updated = await reviewRepository.updateReview(reviewId, {
    rating: data.rating,
    comment: data.comment ?? null,
  });
  return mapReviewRowToDTO(updated);
}

export async function deleteCourseReview(user: SafeUser, reviewId: string): Promise<void> {
  await enforceRateLimit(`review:${user.id}`, 30, 60 * 60 * 1000);
  const review = await reviewRepository.findReviewById(reviewId);
  if (!review || review.userId !== user.id) throw new ReviewNotFoundError();
  await reviewRepository.deleteReview(reviewId);
}
