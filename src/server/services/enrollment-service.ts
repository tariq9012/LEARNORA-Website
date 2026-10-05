import { formatLessonDuration } from "@/lib/format";

import { Prisma } from "../../generated/prisma/client";
import * as enrollmentRepository from "../repositories/enrollment-repository";
import * as courseRepository from "../repositories/course-repository";
import { lessonResourceUrl, lessonVideoUrl } from "../media/media-urls";
import { isEnrollmentEntitled } from "./enrollment-policy";
import { notifyCourseCompleted, notifyFreeEnrollment } from "./notification-events";
import type { SafeUser } from "../auth/types";
import type {
  EnrollmentStateDTO,
  MyLearningCourseDTO,
  StudentDashboardLearningDTO,
} from "../dto/enrollment";
import type { CourseLearningDTO, LearningSectionDTO } from "../dto/learning";

export class EnrollmentError extends Error {}
export class AlreadyEnrolledError extends EnrollmentError {
  constructor() {
    super("You're already enrolled in this course.");
  }
}
export class PaymentRequiredError extends EnrollmentError {
  constructor() {
    super("This course requires purchase before enrollment.");
  }
}
export class CourseNotAvailableError extends EnrollmentError {
  constructor(message = "Course not found.") {
    super(message);
  }
}
export class NotEnrolledError extends EnrollmentError {
  constructor() {
    super("You do not have access to this course.");
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

type EnrollmentWithCourse = Awaited<
  ReturnType<typeof enrollmentRepository.listEnrollmentsWithCourseForUser>
>[number];

function totalLessonsOf(course: EnrollmentWithCourse["course"]): number {
  return course.sections.reduce((sum, s) => sum + s.lessons.length, 0);
}

function nextLessonTitleOf(
  course: EnrollmentWithCourse["course"],
  completedIds: Set<string>,
): string | null {
  const lessons = course.sections.flatMap((s) => s.lessons).sort((a, b) => a.position - b.position);
  const next = lessons.find((l) => !completedIds.has(l.id));
  return next?.title ?? null;
}

function mapToMyLearningDTO(enrollment: EnrollmentWithCourse): MyLearningCourseDTO {
  const total = totalLessonsOf(enrollment.course);
  const completedIds = new Set(enrollment.lessonProgress.map((p) => p.lessonId));
  const progress = total > 0 ? Math.round((completedIds.size / total) * 100) : 0;

  return {
    enrollmentId: enrollment.id,
    courseSlug: enrollment.course.slug,
    title: enrollment.course.title,
    categorySlug: enrollment.course.category.slug,
    category: enrollment.course.category.name,
    instructor: enrollment.course.instructor.name,
    progress,
    completed: enrollment.status === "COMPLETED",
    enrolledAt: enrollment.enrolledAt.toISOString(),
    completedAt: enrollment.completedAt?.toISOString() ?? null,
    nextLessonTitle:
      enrollment.status === "COMPLETED" ? null : nextLessonTitleOf(enrollment.course, completedIds),
  };
}

// ---------------------------------------------------------------------------
// Enrollment
// ---------------------------------------------------------------------------

/**
 * Enrolls a STUDENT in a PUBLISHED, free course. Paid courses are
 * deliberately rejected here rather than faked — checkout is a later
 * phase. Role/active-account checks already happened via requireStudent()
 * before this is ever called; this only owns course-availability and
 * duplicate-enrollment rules.
 */
export async function enrollInCourse(
  user: SafeUser,
  courseSlug: string,
): Promise<{ enrollmentId: string }> {
  const course = await courseRepository.findCourseBySlugForLearning(courseSlug);
  if (!course) throw new CourseNotAvailableError();
  if (course.status !== "PUBLISHED")
    throw new CourseNotAvailableError("This course is not available for enrollment.");
  if (Number(course.price) > 0) throw new PaymentRequiredError();

  const existing = await enrollmentRepository.findEnrollment(user.id, course.id);
  if (existing) {
    if (isEnrollmentEntitled(existing.status)) throw new AlreadyEnrolledError();
    // A CANCELLED enrollment doesn't grant access, but the row still
    // exists — the unique (userId, courseId) constraint means we must
    // reactivate it rather than insert a second row.
    const reactivated = await enrollmentRepository.reactivateEnrollment(existing.id);
    await notifyFreeEnrollment({ studentId: user.id, courseTitle: course.title });
    return { enrollmentId: reactivated.id };
  }

  try {
    const enrollment = await enrollmentRepository.createEnrollment(user.id, course.id);
    // Phase 11: FREE enrollments get an ENROLLMENT notification (paid ones are
    // announced by the payment notification instead — no duplicate spam).
    await notifyFreeEnrollment({ studentId: user.id, courseTitle: course.title });
    return { enrollmentId: enrollment.id };
  } catch (error) {
    // Two concurrent "Enrol now" clicks can both pass the check above; the
    // database's unique constraint is the real guard, so translate its
    // violation into the same friendly error.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AlreadyEnrolledError();
    }
    throw error;
  }
}

/** Powers the course-detail CTA: enrolled+progress, or not-enrolled+whether it's free. */
export async function getEnrollmentState(
  user: SafeUser | null,
  courseSlug: string,
): Promise<EnrollmentStateDTO> {
  const course = await courseRepository.findCourseBySlugForLearning(courseSlug);
  if (!course) return { status: "not_enrolled", free: false };

  if (!user) return { status: "not_enrolled", free: Number(course.price) === 0 };

  const enrollment = await enrollmentRepository.findEnrollmentWithProgress(user.id, course.id);
  if (!enrollment || !isEnrollmentEntitled(enrollment.status)) {
    return { status: "not_enrolled", free: Number(course.price) === 0 };
  }

  const total = await courseRepository.countLessonsForCourse(course.id);
  const progress = total > 0 ? Math.round((enrollment.lessonProgress.length / total) * 100) : 0;

  return { status: "enrolled", progress, completed: enrollment.status === "COMPLETED" };
}

export async function getMyLearning(user: SafeUser): Promise<MyLearningCourseDTO[]> {
  const rows = await enrollmentRepository.listEnrollmentsWithCourseForUser(user.id);
  return rows.map(mapToMyLearningDTO);
}

export async function getStudentDashboardLearning(
  user: SafeUser,
): Promise<StudentDashboardLearningDTO> {
  const [all, continuing] = await Promise.all([
    enrollmentRepository.listEnrollmentsWithCourseForUser(user.id),
    enrollmentRepository.findContinueLearning(user.id, 3),
  ]);

  return {
    enrolledCount: all.length,
    completedCount: all.filter((e) => e.status === "COMPLETED").length,
    continueLearning: continuing.map(mapToMyLearningDTO),
    allEnrollments: all.map(mapToMyLearningDTO),
  };
}

// ---------------------------------------------------------------------------
// Course player / lesson progress
// ---------------------------------------------------------------------------

export type CourseLearningResult =
  { ok: true; data: CourseLearningDTO } | { ok: false; reason: "not_found" | "not_enrolled" };

export async function getCourseLearning(
  user: SafeUser,
  courseSlug: string,
): Promise<CourseLearningResult> {
  const course = await courseRepository.findCourseBySlugForLearning(courseSlug);
  if (!course) return { ok: false, reason: "not_found" };

  const enrollment = await enrollmentRepository.findEnrollmentWithFullProgress(user.id, course.id);
  if (!enrollment || !isEnrollmentEntitled(enrollment.status)) {
    return { ok: false, reason: "not_enrolled" };
  }

  void enrollmentRepository.touchEnrollmentAccess(enrollment.id);

  const progressByLesson = new Map(enrollment.lessonProgress.map((p) => [p.lessonId, p]));
  const completedIds = new Set(
    enrollment.lessonProgress.filter((p) => p.completed).map((p) => p.lessonId),
  );
  const sections: LearningSectionDTO[] = course.sections.map((section) => ({
    id: section.id,
    title: section.title,
    lessons: section.lessons.map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      description: lesson.description ?? "",
      type: lesson.type,
      duration: formatLessonDuration(lesson.duration),
      durationSeconds: lesson.duration,
      completed: completedIds.has(lesson.id),
      // Asset-backed uploads stream through the authorized media route;
      // the legacy pasted-URL field (Phase 6) is used as-is only until an
      // instructor uploads a real video for that lesson. See Phase 7
      // report, "Legacy URL compatibility".
      videoUrl: lesson.videoAssetId
        ? lessonVideoUrl(lesson.videoAssetId)
        : (lesson.videoUrl ?? null),
      watchedSeconds: progressByLesson.get(lesson.id)?.watchedSeconds ?? 0,
      resources: lesson.resources.map((r) => ({
        id: r.id,
        title: r.title,
        originalFilename: r.asset.originalFilename,
        sizeBytes: r.asset.sizeBytes,
        downloadUrl: lessonResourceUrl(r.assetId),
      })),
    })),
  }));

  const flatLessons = sections.flatMap((s) => s.lessons);
  const totalLessons = flatLessons.length;
  const overallPercent =
    totalLessons > 0 ? Math.round((completedIds.size / totalLessons) * 100) : 0;
  const nextLesson = flatLessons.find((l) => !l.completed);

  return {
    ok: true,
    data: {
      courseSlug: course.slug,
      title: course.title,
      categorySlug: course.category.slug,
      instructor: course.instructor.name,
      sections,
      completedLessonIds: [...completedIds],
      totalLessons,
      overallPercent,
      courseCompleted: enrollment.status === "COMPLETED",
      completedAt: enrollment.completedAt?.toISOString() ?? null,
      nextLessonId: nextLesson?.id ?? flatLessons[flatLessons.length - 1]?.id ?? null,
    },
  };
}

export async function markLessonComplete(
  user: SafeUser,
  courseSlug: string,
  lessonId: string,
  completed: boolean,
): Promise<{ completedLessonIds: string[]; overallPercent: number; courseCompleted: boolean }> {
  const course = await courseRepository.findCourseBySlugForLearning(courseSlug);
  if (!course) throw new CourseNotAvailableError();

  const enrollment = await enrollmentRepository.findEnrollment(user.id, course.id);
  if (!enrollment || !isEnrollmentEntitled(enrollment.status)) throw new NotEnrolledError();

  // Never trust that the lessonId the client sent actually belongs to this
  // course — verify the relationship server-side via the database.
  const lesson = await enrollmentRepository.findLessonWithCourseId(lessonId);
  if (!lesson || lesson.section.courseId !== course.id) {
    throw new EnrollmentError("This lesson does not belong to this course.");
  }

  await enrollmentRepository.upsertLessonProgress({
    enrollmentId: enrollment.id,
    lessonId,
    completed,
    ...(completed && { progressPercent: 100 }),
  });
  void enrollmentRepository.touchEnrollmentAccess(enrollment.id);

  const totalLessons = await courseRepository.countLessonsForCourse(course.id);
  const refreshed = await enrollmentRepository.findEnrollmentWithProgress(user.id, course.id);
  const completedLessonIds = refreshed?.lessonProgress.map((p) => p.lessonId) ?? [];
  const overallPercent =
    totalLessons > 0 ? Math.round((completedLessonIds.length / totalLessons) * 100) : 0;
  const courseCompleted = totalLessons > 0 && completedLessonIds.length === totalLessons;

  // Keep Enrollment.status authoritative and in sync with actual
  // completion — completing the last lesson marks the course done;
  // un-completing any lesson afterwards returns it to active.
  await enrollmentRepository.setEnrollmentStatus(
    enrollment.id,
    courseCompleted ? "COMPLETED" : "ACTIVE",
    courseCompleted ? new Date() : null,
  );

  // Phase 11: notify on the FIRST transition into COMPLETED only. `enrollment`
  // was read before the update, so a course that was already COMPLETED never
  // re-notifies, and the eventKey (course-completed:<enrollmentId>) also
  // absorbs two concurrent "last lesson" requests.
  if (courseCompleted && enrollment.status !== "COMPLETED") {
    await notifyCourseCompleted({
      studentId: user.id,
      enrollmentId: enrollment.id,
      courseTitle: course.title,
    });
  }

  return { completedLessonIds, overallPercent, courseCompleted };
}

const AUTO_COMPLETE_WATCHED_RATIO = 0.9;

/**
 * Saves a lesson's playback checkpoint (called from the client on a
 * throttle — every 15-30s, on pause, on lesson change, on end — never
 * once a second). Auto-completes the lesson once the student has watched
 * >= 90% of it or the video ended, without touching a lesson someone
 * already completed manually, and without ever regressing an existing
 * completion.
 */
export async function updateVideoProgress(
  user: SafeUser,
  courseSlug: string,
  lessonId: string,
  watchedSeconds: number,
  ended: boolean,
): Promise<{
  watchedSeconds: number;
  completed: boolean;
  overallPercent: number | null;
  courseCompleted: boolean | null;
}> {
  const course = await courseRepository.findCourseBySlugForLearning(courseSlug);
  if (!course) throw new CourseNotAvailableError();

  const enrollment = await enrollmentRepository.findEnrollment(user.id, course.id);
  if (!enrollment || !isEnrollmentEntitled(enrollment.status)) throw new NotEnrolledError();

  // Never trust the client's lessonId/duration assumptions — verify
  // ownership and clamp against the lesson's real duration server-side.
  const lesson = await enrollmentRepository.findLessonForProgress(lessonId);
  if (!lesson || lesson.section.courseId !== course.id) {
    throw new EnrollmentError("This lesson does not belong to this course.");
  }

  const safeWatched = Math.max(0, Math.round(watchedSeconds));
  const clamped = lesson.duration ? Math.min(safeWatched, lesson.duration) : safeWatched;

  const shouldAutoComplete =
    ended || (lesson.duration != null && clamped >= lesson.duration * AUTO_COMPLETE_WATCHED_RATIO);

  if (shouldAutoComplete) {
    // markLessonComplete both records completion and keeps course-level
    // status in sync — reuse it instead of duplicating that logic here.
    // It's a no-op status-wise if the lesson was already complete.
    const result = await markLessonComplete(user, courseSlug, lessonId, true);
    // markLessonComplete doesn't touch watchedSeconds, so persist that separately.
    await enrollmentRepository.upsertLessonProgress({
      enrollmentId: enrollment.id,
      lessonId,
      watchedSeconds: clamped,
    });
    return {
      watchedSeconds: clamped,
      completed: true,
      overallPercent: result.overallPercent,
      courseCompleted: result.courseCompleted,
    };
  }

  await enrollmentRepository.upsertLessonProgress({
    enrollmentId: enrollment.id,
    lessonId,
    watchedSeconds: clamped,
  });
  return { watchedSeconds: clamped, completed: false, overallPercent: null, courseCompleted: null };
}
