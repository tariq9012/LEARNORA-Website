import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { ForbiddenError, UnauthorizedError, getCurrentUser, requireStudent } from "../auth/guards";
import {
  ReviewError,
  createCourseReview,
  deleteCourseReview,
  getMyCourseReview,
  updateCourseReview,
} from "../services/review-service";
import type { ReviewDTO, MyReviewStateDTO } from "../dto/review";
import {
  courseSlugForReviewSchema,
  reviewIdSchema,
  updateReviewSchema,
} from "../validation/review";

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

function toActionError(error: unknown): { success: false; error: string } {
  if (error instanceof z.ZodError) {
    return { success: false, error: error.issues[0]?.message ?? "Invalid input." };
  }
  if (error instanceof UnauthorizedError) {
    return { success: false, error: "Please log in to continue." };
  }
  if (error instanceof ForbiddenError) {
    return { success: false, error: "Only student accounts can do that." };
  }
  if (error instanceof ReviewError) {
    return { success: false, error: error.message };
  }
  console.error("[review] unexpected error", error);
  return { success: false, error: "Something went wrong. Please try again." };
}

/** Public — works for logged-out visitors too, so the course-detail review section knows what to show. */
export const getMyCourseReviewFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => courseSlugForReviewSchema.parse(data))
  .handler(async ({ data }): Promise<MyReviewStateDTO> => {
    const user = await getCurrentUser();
    return getMyCourseReview(user, data.courseSlug);
  });

export const createCourseReviewFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const { courseSlug } = courseSlugForReviewSchema.parse(data);
    return { courseSlug, fields: data };
  })
  .handler(async ({ data }): Promise<ActionResult<ReviewDTO>> => {
    try {
      const user = await requireStudent();
      const review = await createCourseReview(user, data.courseSlug, data.fields);
      return { success: true, data: review };
    } catch (error) {
      return toActionError(error);
    }
  });

export const updateCourseReviewFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => updateReviewSchema.parse(data))
  .handler(async ({ data }): Promise<ActionResult<ReviewDTO>> => {
    try {
      const user = await requireStudent();
      const review = await updateCourseReview(user, data.reviewId, data);
      return { success: true, data: review };
    } catch (error) {
      return toActionError(error);
    }
  });

export const deleteCourseReviewFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => reviewIdSchema.parse(data))
  .handler(async ({ data }): Promise<ActionResult<null>> => {
    try {
      const user = await requireStudent();
      await deleteCourseReview(user, data.reviewId);
      return { success: true, data: null };
    } catch (error) {
      return toActionError(error);
    }
  });
