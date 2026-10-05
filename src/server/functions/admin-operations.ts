import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { ForbiddenError, UnauthorizedError, requireAdmin } from "../auth/guards";
import {
  CategoryAdminError,
  createAdminCategory,
  listAdminCategories,
  listCategoryOptions,
  updateAdminCategory,
} from "../services/admin-category-service";
import { listAdminCourses } from "../services/admin-course-list-service";
import {
  UserAdminError,
  listAdminStudents,
  listAdminUsers,
  setUserStatus,
} from "../services/admin-user-service";
import {
  InstructorAdminError,
  decideInstructor,
  listAdminInstructors,
} from "../services/admin-instructor-service";
import { listAdminEnrollments } from "../services/enrollment-listing-service";
import {
  ReviewAdminError,
  listAdminReviews,
  setReviewHidden,
} from "../services/review-listing-service";
import type { AdminCategoryDTO } from "../dto/admin";

/**
 * Phase 14 admin operations. EVERY handler calls requireAdmin() itself —
 * the route-level layout redirect is UX only, never the security
 * boundary — and the services assert ADMIN again. Nothing here accepts
 * an admin identity from the client. Mutations are createServerFn POSTs
 * (same CSRF model as every other server-function mutation); there are no
 * raw HTTP routes in this phase.
 */

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

function toActionError(error: unknown): { success: false; error: string } {
  if (error instanceof z.ZodError) {
    return { success: false, error: error.issues[0]?.message ?? "Invalid input." };
  }
  if (error instanceof UnauthorizedError)
    return { success: false, error: "Please log in to continue." };
  if (error instanceof ForbiddenError) return { success: false, error: "Only admins can do that." };
  if (
    error instanceof CategoryAdminError ||
    error instanceof InstructorAdminError ||
    error instanceof ReviewAdminError ||
    error instanceof UserAdminError
  ) {
    return { success: false, error: error.message };
  }
  console.error("[admin-operations] unexpected error", error);
  return { success: false, error: "Something went wrong. Please try again." };
}

const passThrough = (data: unknown) => data ?? {};

export const getAdminCoursesFn = createServerFn({ method: "GET" })
  .validator(passThrough)
  .handler(async ({ data }) => listAdminCourses(await requireAdmin(), data));

export const getAdminInstructorsFn = createServerFn({ method: "GET" })
  .validator(passThrough)
  .handler(async ({ data }) => listAdminInstructors(await requireAdmin(), data));

export const decideInstructorFn = createServerFn({ method: "POST" })
  .validator(passThrough)
  .handler(async ({ data }): Promise<ActionResult<null>> => {
    try {
      await decideInstructor(await requireAdmin(), data);
      return { success: true, data: null };
    } catch (error) {
      return toActionError(error);
    }
  });

export const getAdminEnrollmentsFn = createServerFn({ method: "GET" })
  .validator(passThrough)
  .handler(async ({ data }) => listAdminEnrollments(await requireAdmin(), data));

export const getAdminReviewsFn = createServerFn({ method: "GET" })
  .validator(passThrough)
  .handler(async ({ data }) => listAdminReviews(await requireAdmin(), data));

export const setReviewHiddenFn = createServerFn({ method: "POST" })
  .validator(passThrough)
  .handler(async ({ data }): Promise<ActionResult<null>> => {
    try {
      await setReviewHidden(await requireAdmin(), data);
      return { success: true, data: null };
    } catch (error) {
      return toActionError(error);
    }
  });

export const getAdminCategoriesFn = createServerFn({ method: "GET" })
  .validator(passThrough)
  .handler(async ({ data }) => listAdminCategories(await requireAdmin(), data));

export const getCategoryOptionsFn = createServerFn({ method: "GET" }).handler(async () =>
  listCategoryOptions(await requireAdmin()),
);

export const createCategoryFn = createServerFn({ method: "POST" })
  .validator(passThrough)
  .handler(async ({ data }): Promise<ActionResult<AdminCategoryDTO>> => {
    try {
      return { success: true, data: await createAdminCategory(await requireAdmin(), data) };
    } catch (error) {
      return toActionError(error);
    }
  });

export const updateCategoryFn = createServerFn({ method: "POST" })
  .validator(passThrough)
  .handler(async ({ data }): Promise<ActionResult<AdminCategoryDTO>> => {
    try {
      return { success: true, data: await updateAdminCategory(await requireAdmin(), data) };
    } catch (error) {
      return toActionError(error);
    }
  });

// -- Phase 15: users / students -------------------------------------------------

export const getAdminUsersFn = createServerFn({ method: "GET" })
  .validator(passThrough)
  .handler(async ({ data }) => listAdminUsers(await requireAdmin(), data));

export const getAdminStudentsFn = createServerFn({ method: "GET" })
  .validator(passThrough)
  .handler(async ({ data }) => listAdminStudents(await requireAdmin(), data));

/** Suspend / ban / reactivate. Never self, never another admin; see admin-user-service.ts. */
export const setUserStatusFn = createServerFn({ method: "POST" })
  .validator(passThrough)
  .handler(async ({ data }): Promise<ActionResult<null>> => {
    try {
      await setUserStatus(await requireAdmin(), data);
      return { success: true, data: null };
    } catch (error) {
      return toActionError(error);
    }
  });
