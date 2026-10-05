import { ForbiddenError } from "../auth/guards";
import * as enrollmentRepository from "../repositories/enrollment-repository";
import { publicAssetUrl } from "../media/media-urls";
import { resolvePagination } from "../validation/pagination";
import { listAdminEnrollmentsSchema } from "../validation/admin";
import { listInstructorStudentsSchema } from "../validation/instructor-analytics";
import type { SafeUser } from "../auth/types";
import type { AdminEnrollmentListDTO, InstructorStudentListDTO } from "../dto/admin";

type Filters = enrollmentRepository.EnrollmentListFilters;

/**
 * Shared row builder so admin and instructor views use ONE progress
 * definition — the same one My Learning uses:
 *   round(completed lessons / total lessons in the course * 100), 0 if the course has no lessons.
 * Two grouped queries for the whole page (lesson totals, completed
 * counts) — no per-row queries.
 */
async function loadPage(
  filters: Filters,
  input: { page?: number | undefined; pageSize?: number | undefined },
) {
  const { page, pageSize, skip, take } = resolvePagination(input);
  const [rows, total] = await Promise.all([
    enrollmentRepository.listEnrollmentsForListing(filters, skip, take),
    enrollmentRepository.countEnrollmentsForListing(filters),
  ]);

  const courseIds = [...new Set(rows.map((r) => r.courseId))];
  const [lessonTotals, completed] = rows.length
    ? await Promise.all([
        enrollmentRepository.lessonTotalsForCourses(courseIds),
        enrollmentRepository.completedLessonCounts(rows.map((r) => r.id)),
      ])
    : [[], []];

  const totalByCourse = new Map(
    lessonTotals.map((c) => [c.id, c.sections.reduce((sum, s) => sum + s._count.lessons, 0)]),
  );
  const completedByEnrollment = new Map(completed.map((c) => [c.enrollmentId, c._count._all]));

  const progressOf = (enrollmentId: string, courseId: string) => {
    const totalLessons = totalByCourse.get(courseId) ?? 0;
    const done = completedByEnrollment.get(enrollmentId) ?? 0;
    return totalLessons > 0 ? Math.round((done / totalLessons) * 100) : 0;
  };

  return { rows, total, page, pageSize, progressOf };
}

export async function listAdminEnrollments(
  admin: SafeUser,
  input: unknown,
): Promise<AdminEnrollmentListDTO> {
  if (admin.role !== "ADMIN") throw new ForbiddenError("Only admins can do that.");
  const parsed = listAdminEnrollmentsSchema.parse(input ?? {});
  const filters: Filters = {
    ...(parsed.search && { search: parsed.search }),
    ...(parsed.status && { status: parsed.status }),
    ...(parsed.courseId && { courseId: parsed.courseId }),
  };
  const { rows, total, page, pageSize, progressOf } = await loadPage(filters, parsed);

  return {
    total,
    page,
    pageSize,
    enrollments: rows.map((r) => ({
      id: r.id,
      studentName: r.user.name,
      courseTitle: r.course.title,
      courseId: r.courseId,
      instructorName: r.course.instructor.name,
      status: r.status,
      enrolledAt: r.enrolledAt.toISOString(),
      completedAt: r.completedAt?.toISOString() ?? null,
      progressPercent: progressOf(r.id, r.courseId),
    })),
  };
}

/**
 * Students enrolled in at least one course owned by the SIGNED-IN
 * instructor. instructorId comes from the session and is baked into the
 * repository WHERE clause (course.instructorId) — a manipulated
 * courseId for someone else's course matches nothing. Returns display
 * name + avatar only; no email or billing data.
 */
export async function listInstructorStudents(
  instructor: SafeUser,
  input: unknown,
): Promise<InstructorStudentListDTO> {
  if (instructor.role !== "INSTRUCTOR") throw new ForbiddenError("Only instructors can do that.");
  const parsed = listInstructorStudentsSchema.parse(input ?? {});
  const filters: Filters = {
    instructorId: instructor.id,
    ...(parsed.search && { search: parsed.search }),
    ...(parsed.status && { status: parsed.status }),
    ...(parsed.courseId && { courseId: parsed.courseId }),
  };
  const { rows, total, page, pageSize, progressOf } = await loadPage(filters, parsed);

  return {
    total,
    page,
    pageSize,
    students: rows.map((r) => ({
      id: r.id,
      studentName: r.user.name,
      avatarUrl: r.user.avatarAssetId ? publicAssetUrl(r.user.avatarAssetId) : r.user.avatar,
      courseId: r.courseId,
      courseTitle: r.course.title,
      status: r.status,
      enrolledAt: r.enrolledAt.toISOString(),
      completedAt: r.completedAt?.toISOString() ?? null,
      progressPercent: progressOf(r.id, r.courseId),
    })),
  };
}
