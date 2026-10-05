import { createServerFn } from "@tanstack/react-start";

import { browseCourses, getCourseBySlug, getFeaturedCourses } from "../services/course-service";
import type { CourseSort } from "../repositories/course-repository";
import { listCategories, getCategoryBySlug } from "../services/category-service";
import { getInstructorProfile } from "../services/instructor-service";
import { getFaculty, getPlatformStats } from "../services/platform-stats-service";
import { getReviewsForCourse, getRatingBreakdown } from "../services/review-service";

export type BrowseCoursesInput = {
  search?: string;
  categorySlug?: string;
  level?: string;
  sort?: CourseSort;
  page?: number;
  pageSize?: number;
};

/**
 * All of these are public reads — no login required — but every one of
 * them goes through a service that hard-codes `status: "PUBLISHED"` (and,
 * for instructors, `approvalStatus: "APPROVED"`) server-side. The browser
 * never gets to pick which statuses are visible.
 */

export const getCoursesFn = createServerFn({ method: "GET" })
  .validator((data: BrowseCoursesInput | undefined) => data ?? {})
  .handler(async ({ data }) => browseCourses(data));

export const getFeaturedCoursesFn = createServerFn({ method: "GET" })
  .validator((data: { limit?: number } | undefined) => data ?? {})
  .handler(async ({ data }) => getFeaturedCourses(data.limit));

export const getCourseBySlugFn = createServerFn({ method: "GET" })
  .validator((data: { slug: string }) => data)
  .handler(async ({ data }) => getCourseBySlug(data.slug));

export const getCourseReviewsFn = createServerFn({ method: "GET" })
  .validator((data: { courseId: string }) => data)
  .handler(async ({ data }) => getReviewsForCourse(data.courseId));

export const getRatingBreakdownFn = createServerFn({ method: "GET" })
  .validator((data: { courseId: string }) => data)
  .handler(async ({ data }) => getRatingBreakdown(data.courseId));

export const getCategoriesFn = createServerFn({ method: "GET" }).handler(async () =>
  listCategories(),
);

export const getCategoryBySlugFn = createServerFn({ method: "GET" })
  .validator((data: { slug: string }) => data)
  .handler(async ({ data }) => getCategoryBySlug(data.slug));

export const getInstructorProfileFn = createServerFn({ method: "GET" })
  .validator((data: { instructorId: string }) => data)
  .handler(async ({ data }) => getInstructorProfile(data.instructorId));

/** Public, aggregate-only marketing numbers computed live from the database. */
export const getPlatformStatsFn = createServerFn({ method: "GET" }).handler(async () =>
  getPlatformStats(),
);

export const getFacultyFn = createServerFn({ method: "GET" }).handler(async () => getFaculty(4));
