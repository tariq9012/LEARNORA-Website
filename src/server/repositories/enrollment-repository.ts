import { prisma } from "../db/client";
import { ENTITLED_ENROLLMENT_STATUSES } from "../services/enrollment-policy";

export function findEnrollment(userId: string, courseId: string) {
  return prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
  });
}

export function findEnrollmentWithProgress(userId: string, courseId: string) {
  return prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
    include: { lessonProgress: { where: { completed: true }, select: { lessonId: true } } },
  });
}

/** Same as above but with every lesson's watchedSeconds too, for the course player's resume behavior. */
export function findEnrollmentWithFullProgress(userId: string, courseId: string) {
  return prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
    include: {
      lessonProgress: { select: { lessonId: true, completed: true, watchedSeconds: true } },
    },
  });
}

export function createEnrollment(userId: string, courseId: string) {
  // The @@unique([userId, courseId]) constraint in the schema is the real
  // guard against duplicate enrollment; Prisma will throw P2002 here if a
  // race condition slips one past the earlier findEnrollment check, and
  // the service layer is responsible for turning that into a clean error.
  return prisma.enrollment.create({ data: { userId, courseId } });
}

/** Brings a previously-CANCELLED enrollment back to ACTIVE, re-enrolling without violating the unique (userId, courseId) constraint. */
export function reactivateEnrollment(enrollmentId: string) {
  return prisma.enrollment.update({
    where: { id: enrollmentId },
    data: { status: "ACTIVE", completedAt: null },
  });
}

const MY_LEARNING_INCLUDE = {
  course: {
    include: {
      instructor: true,
      category: true,
      sections: { select: { lessons: { select: { id: true, title: true, position: true } } } },
    },
  },
  lessonProgress: { where: { completed: true }, select: { lessonId: true } },
} as const;

/**
 * My Learning / dashboard source. Only CURRENTLY ENTITLED enrollments are
 * listed: a CANCELLED one (e.g. after a Phase 10 refund) has no access, so it
 * must not appear as a course the student can "continue" — the row is kept
 * in the database for history, not shown as a live grant.
 */
export function listEnrollmentsWithCourseForUser(userId: string) {
  return prisma.enrollment.findMany({
    where: { userId, status: { in: [...ENTITLED_ENROLLMENT_STATUSES] } },
    include: MY_LEARNING_INCLUDE,
    orderBy: [{ lastAccessedAt: { sort: "desc", nulls: "last" } }, { enrolledAt: "desc" }],
  });
}

/** Most recently accessed, still-in-progress enrollments — the "continue learning" source. Excludes COMPLETED (nothing left to continue) and CANCELLED (no entitlement). */
export function findContinueLearning(userId: string, take = 3) {
  return prisma.enrollment.findMany({
    where: { userId, status: "ACTIVE" },
    include: MY_LEARNING_INCLUDE,
    orderBy: [{ lastAccessedAt: { sort: "desc", nulls: "last" } }, { enrolledAt: "desc" }],
    take,
  });
}

export function touchEnrollmentAccess(enrollmentId: string) {
  return prisma.enrollment
    .update({ where: { id: enrollmentId }, data: { lastAccessedAt: new Date() } })
    .catch(() => {
      // Best-effort — never block a page load on this.
    });
}

export function setEnrollmentStatus(
  enrollmentId: string,
  status: "ACTIVE" | "COMPLETED",
  completedAt: Date | null,
) {
  return prisma.enrollment.update({ where: { id: enrollmentId }, data: { status, completedAt } });
}

export function upsertLessonProgress(params: {
  enrollmentId: string;
  lessonId: string;
  completed?: boolean;
  progressPercent?: number;
  watchedSeconds?: number;
}) {
  const { enrollmentId, lessonId, completed, ...rest } = params;
  // completedAt only moves when `completed` is explicitly passed — a
  // watchedSeconds-only checkpoint update (see updateVideoProgress in
  // enrollment-service.ts) must never clear a completion that was just
  // set by a separate call.
  const completedFields =
    completed === undefined ? {} : { completed, completedAt: completed ? new Date() : null };
  return prisma.lessonProgress.upsert({
    where: { enrollmentId_lessonId: { enrollmentId, lessonId } },
    create: { enrollmentId, lessonId, completed: completed ?? false, ...rest, ...completedFields },
    update: { ...rest, ...completedFields },
  });
}

export function getEnrollmentProgressSummary(enrollmentId: string) {
  return prisma.lessonProgress.aggregate({
    where: { enrollmentId },
    _count: { _all: true },
  });
}

/** Fetches a lesson together with the course it belongs to, so ownership can be verified. */
export function findLessonWithCourseId(lessonId: string) {
  return prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { id: true, section: { select: { courseId: true } } },
  });
}

/** Same, plus duration — used to clamp/validate reported video progress server-side. */
export function findLessonForProgress(lessonId: string) {
  return prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { id: true, duration: true, section: { select: { courseId: true } } },
  });
}

// ---------------------------------------------------------------------------
// Phase 14 — admin enrollment listing + instructor students (ownership in the query)
// ---------------------------------------------------------------------------

export type EnrollmentListFilters = {
  search?: string;
  status?: "ACTIVE" | "COMPLETED" | "CANCELLED";
  courseId?: string;
  /** Set by the SERVICE from the session for instructor views — never from the client. Restricts to courses this instructor owns. */
  instructorId?: string;
};

function buildEnrollmentListWhere(filters: EnrollmentListFilters) {
  return {
    ...(filters.status && { status: filters.status }),
    ...(filters.courseId && { courseId: filters.courseId }),
    // Ownership is part of the WHERE clause itself, so a courseId that
    // belongs to another instructor simply matches zero rows.
    ...(filters.instructorId && { course: { instructorId: filters.instructorId } }),
    ...(filters.search && {
      OR: [
        { user: { name: { contains: filters.search, mode: "insensitive" as const } } },
        { course: { title: { contains: filters.search, mode: "insensitive" as const } } },
      ],
    }),
  };
}

/** Explicit select: student display name + avatar only — no email, no raw user row. */
export function listEnrollmentsForListing(
  filters: EnrollmentListFilters,
  skip: number,
  take: number,
) {
  return prisma.enrollment.findMany({
    where: buildEnrollmentListWhere(filters),
    orderBy: { enrolledAt: "desc" },
    skip,
    take,
    select: {
      id: true,
      status: true,
      enrolledAt: true,
      completedAt: true,
      courseId: true,
      user: { select: { name: true, avatar: true, avatarAssetId: true } },
      course: { select: { title: true, instructor: { select: { name: true } } } },
    },
  });
}

export function countEnrollmentsForListing(filters: EnrollmentListFilters) {
  return prisma.enrollment.count({ where: buildEnrollmentListWhere(filters) });
}

/** Lesson totals for a page of courses in one query. */
export function lessonTotalsForCourses(courseIds: string[]) {
  return prisma.course.findMany({
    where: { id: { in: courseIds } },
    select: { id: true, sections: { select: { _count: { select: { lessons: true } } } } },
  });
}

/** Completed-lesson counts for a page of enrollments in one grouped query. */
export function completedLessonCounts(enrollmentIds: string[]) {
  return prisma.lessonProgress.groupBy({
    by: ["enrollmentId"],
    where: { enrollmentId: { in: enrollmentIds }, completed: true },
    _count: { _all: true },
  });
}
