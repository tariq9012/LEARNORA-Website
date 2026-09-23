import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { ForbiddenError, UnauthorizedError, requireAdmin } from "../auth/guards";
import {
  AdminReviewError,
  approveCourse,
  getCourseForReview,
  getModerationCounts,
  getPendingCourses,
  rejectCourse,
} from "../services/admin-course-review-service";

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

function toActionError(error: unknown): { success: false; error: string } {
  if (error instanceof z.ZodError) {
    return { success: false, error: error.issues[0]?.message ?? "Invalid input." };
  }
  if (error instanceof UnauthorizedError) {
    return { success: false, error: "Please log in to continue." };
  }
  if (error instanceof ForbiddenError) {
    return { success: false, error: "Only admins can do that." };
  }
  if (error instanceof AdminReviewError) {
    return { success: false, error: error.message };
  }
  console.error("[admin-course] unexpected error", error);
  return { success: false, error: "Something went wrong. Please try again." };
}

const courseIdSchema = z.object({ courseId: z.string().min(1) });

export const getPendingCoursesFn = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  return getPendingCourses();
});

export const getAdminCourseReviewFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => courseIdSchema.parse(data))
  .handler(async ({ data }) => {
    await requireAdmin();
    return getCourseForReview(data.courseId);
  });

export const approveCourseFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => courseIdSchema.parse(data))
  .handler(async ({ data }): Promise<ActionResult<null>> => {
    try {
      const admin = await requireAdmin();
      await approveCourse(admin.id, data.courseId);
      return { success: true, data: null };
    } catch (error) {
      return toActionError(error);
    }
  });

export const rejectCourseFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ courseId: z.string().min(1), reason: z.string() }).parse(data),
  )
  .handler(async ({ data }): Promise<ActionResult<null>> => {
    try {
      const admin = await requireAdmin();
      await rejectCourse(admin.id, data.courseId, { reason: data.reason });
      return { success: true, data: null };
    } catch (error) {
      return toActionError(error);
    }
  });

export const getModerationCountsFn = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  return getModerationCounts();
});
