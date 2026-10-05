import { formatDurationHM, formatLessonDuration, formatMonthYear } from "@/lib/format";

import * as adminCourseRepository from "../repositories/admin-course-repository";
import { rejectCourseSchema } from "../validation/instructor-course";
import { notifyCourseReviewed } from "./notification-events";
import type { AdminCourseQueueItemDTO, AdminCourseReviewDTO } from "../dto/admin-course";

export class AdminReviewError extends Error {}

export async function getPendingCourses(): Promise<AdminCourseQueueItemDTO[]> {
  const rows = await adminCourseRepository.findPendingCourses();
  return rows.map((c) => ({
    id: c.id,
    title: c.title,
    instructorName: c.instructor.name,
    category: c.category.name,
    price: Number(c.discountPrice ?? c.price),
    sectionCount: c._count.sections,
    submittedAt: c.submittedAt?.toISOString() ?? null,
  }));
}

export async function getCourseForReview(courseId: string): Promise<AdminCourseReviewDTO | null> {
  const course = await adminCourseRepository.findCourseForReview(courseId);
  if (!course) return null;

  const totalSeconds = course.sections
    .flatMap((s) => s.lessons)
    .reduce((sum, l) => sum + (l.duration ?? 0), 0);

  return {
    id: course.id,
    title: course.title,
    subtitle: course.subtitle ?? "",
    description: course.description ?? "",
    thumbnail: course.thumbnail ?? "",
    category: course.category.name,
    level: course.level,
    language: course.language,
    price: Number(course.price),
    discountPrice: course.discountPrice != null ? Number(course.discountPrice) : null,
    status: course.status,
    instructorName: course.instructor.name,
    instructorHeadline: course.instructor.instructorProfile?.headline ?? "",
    instructorApprovalStatus: course.instructor.instructorProfile?.approvalStatus ?? "PENDING",
    learningOutcomes: course.learningOutcomes,
    requirements: course.requirements,
    sectionCount: course.sections.length,
    lessonCount: course.sections.reduce((sum, s) => sum + s.lessons.length, 0),
    totalDuration: formatDurationHM(totalSeconds),
    submittedAt: course.submittedAt ? formatMonthYear(course.submittedAt) : null,
    sections: course.sections.map((s) => ({
      id: s.id,
      title: s.title,
      lessons: s.lessons.map((l) => ({
        id: l.id,
        title: l.title,
        duration: formatLessonDuration(l.duration),
        isPreview: l.isPreview,
      })),
    })),
  };
}

async function announceReview(courseId: string, approved: boolean): Promise<void> {
  const course = await adminCourseRepository.findReviewOutcome(courseId);
  if (!course) return;
  await notifyCourseReviewed({
    ownerId: course.instructorId,
    courseId,
    courseTitle: course.title,
    approved,
    reviewedAtMs: (course.reviewedAt ?? new Date()).getTime(),
    reason: approved ? null : course.rejectionReason,
  });
}

export async function approveCourse(adminId: string, courseId: string): Promise<void> {
  const result = await adminCourseRepository.approveCourse(courseId, adminId);
  if (result.count === 0) {
    // A repeated/idempotent review matches 0 rows and throws HERE, before any notification.
    throw new AdminReviewError("Course has already been reviewed.");
  }
  await announceReview(courseId, true);
}

export async function rejectCourse(
  adminId: string,
  courseId: string,
  input: unknown,
): Promise<void> {
  const { reason } = rejectCourseSchema.parse(input);
  const result = await adminCourseRepository.rejectCourse(courseId, adminId, reason);
  if (result.count === 0) {
    throw new AdminReviewError("Course has already been reviewed.");
  }
  await announceReview(courseId, false);
}

export async function getModerationCounts() {
  const groups = await adminCourseRepository.countCoursesByStatus();
  const counts: Record<string, number> = {};
  for (const g of groups) counts[g.status] = g._count._all;
  return {
    pendingReview: counts["PENDING_REVIEW"] ?? 0,
    published: counts["PUBLISHED"] ?? 0,
    rejected: counts["REJECTED"] ?? 0,
  };
}
