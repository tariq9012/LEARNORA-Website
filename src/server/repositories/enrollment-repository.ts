import { prisma } from "../db/client";

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

export function listEnrollmentsWithCourseForUser(userId: string) {
  return prisma.enrollment.findMany({
    where: { userId },
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
