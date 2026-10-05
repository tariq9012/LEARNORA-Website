import { createServerFn } from "@tanstack/react-start";

import { requireInstructor } from "../auth/guards";
import { getInstructorAnalytics } from "../services/instructor-analytics-service";
import { listInstructorStudents } from "../services/enrollment-listing-service";
import { listInstructorReviews } from "../services/review-listing-service";

/**
 * Instructor analytics/students/reviews (Phase 14). Identity is always the
 * session instructor (requireInstructor); no function takes an
 * instructorId, and the input schemas are .strict() so a smuggled one is
 * rejected. Read-only — no mutation is exposed to instructors here.
 */

export const getInstructorAnalyticsFn = createServerFn({ method: "GET" }).handler(async () =>
  getInstructorAnalytics(await requireInstructor()),
);

export const getInstructorStudentsFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => data ?? {})
  .handler(async ({ data }) => listInstructorStudents(await requireInstructor(), data));

export const getInstructorReviewsFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => data ?? {})
  .handler(async ({ data }) => listInstructorReviews(await requireInstructor(), data));
