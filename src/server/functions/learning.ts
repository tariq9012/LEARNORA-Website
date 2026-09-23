import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { ForbiddenError, UnauthorizedError, getCurrentUser, requireStudent } from "../auth/guards";
import {
  EnrollmentError,
  enrollInCourse,
  getCourseLearning,
  getEnrollmentState,
  getMyLearning,
  getStudentDashboardLearning,
  markLessonComplete,
  updateVideoProgress,
} from "../services/enrollment-service";
import {
  addToWishlist,
  getMyWishlist,
  isWishlisted,
  removeFromWishlist,
  WishlistError,
} from "../services/wishlist-service";
import {
  courseSlugSchema,
  markLessonCompleteSchema,
  updateVideoProgressSchema,
} from "../validation/learning";

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
  if (error instanceof EnrollmentError || error instanceof WishlistError) {
    return { success: false, error: error.message };
  }
  console.error("[learning] unexpected error", error);
  return { success: false, error: "Something went wrong. Please try again." };
}

// ---------------------------------------------------------------------------
// Enrollment
// ---------------------------------------------------------------------------

export const enrollInCourseFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => courseSlugSchema.parse(data))
  .handler(async ({ data }): Promise<ActionResult<{ enrollmentId: string }>> => {
    try {
      const user = await requireStudent();
      const result = await enrollInCourse(user, data.courseSlug);
      return { success: true, data: result };
    } catch (error) {
      return toActionError(error);
    }
  });

/** Public — works for logged-out visitors too, so the course-detail CTA knows what to show. */
export const getEnrollmentStateFn = createServerFn({ method: "GET" })
  .validator((data: { courseSlug: string }) => data)
  .handler(async ({ data }) => {
    const user = await getCurrentUser();
    return getEnrollmentState(user, data.courseSlug);
  });

// ---------------------------------------------------------------------------
// Wishlist
// ---------------------------------------------------------------------------

export const addWishlistFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => courseSlugSchema.parse(data))
  .handler(async ({ data }): Promise<ActionResult<null>> => {
    try {
      const user = await requireStudent();
      await addToWishlist(user, data.courseSlug);
      return { success: true, data: null };
    } catch (error) {
      return toActionError(error);
    }
  });

export const removeWishlistFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => courseSlugSchema.parse(data))
  .handler(async ({ data }): Promise<ActionResult<null>> => {
    try {
      const user = await requireStudent();
      await removeFromWishlist(user, data.courseSlug);
      return { success: true, data: null };
    } catch (error) {
      return toActionError(error);
    }
  });

/** Public — logged-out visitors just always get `false`. */
export const getWishlistStateFn = createServerFn({ method: "GET" })
  .validator((data: { courseSlug: string }) => data)
  .handler(async ({ data }) => {
    const user = await getCurrentUser();
    return isWishlisted(user, data.courseSlug);
  });

export const getMyWishlistFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireStudent();
  return getMyWishlist(user);
});

// ---------------------------------------------------------------------------
// My Learning / dashboard
// ---------------------------------------------------------------------------

export const getMyLearningFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireStudent();
  return getMyLearning(user);
});

export const getStudentDashboardLearningFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireStudent();
  return getStudentDashboardLearning(user);
});

// ---------------------------------------------------------------------------
// Course player
// ---------------------------------------------------------------------------

export const getCourseLearningFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => courseSlugSchema.parse(data))
  .handler(async ({ data }) => {
    const user = await requireStudent();
    return getCourseLearning(user, data.courseSlug);
  });

export const markLessonCompleteFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => markLessonCompleteSchema.parse(data))
  .handler(
    async ({
      data,
    }): Promise<
      ActionResult<{
        completedLessonIds: string[];
        overallPercent: number;
        courseCompleted: boolean;
      }>
    > => {
      try {
        const user = await requireStudent();
        const result = await markLessonComplete(
          user,
          data.courseSlug,
          data.lessonId,
          data.completed,
        );
        return { success: true, data: result };
      } catch (error) {
        return toActionError(error);
      }
    },
  );

/**
 * Video playback checkpoint. The client throttles calls to this (every
 * 15-30s, on pause, on lesson change, on end) — never once a second.
 */
export const updateVideoProgressFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => updateVideoProgressSchema.parse(data))
  .handler(
    async ({
      data,
    }): Promise<
      ActionResult<{
        watchedSeconds: number;
        completed: boolean;
        overallPercent: number | null;
        courseCompleted: boolean | null;
      }>
    > => {
      try {
        const user = await requireStudent();
        const result = await updateVideoProgress(
          user,
          data.courseSlug,
          data.lessonId,
          data.watchedSeconds,
          data.ended,
        );
        return { success: true, data: result };
      } catch (error) {
        return toActionError(error);
      }
    },
  );
