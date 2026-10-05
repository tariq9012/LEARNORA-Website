import { prisma } from "../db/client";
import {
  ENTITLED_ENROLLMENT_STATUSES,
  entitledEnrollmentsCount,
} from "../services/enrollment-policy";

/** A publicly-discoverable instructor: must be an approved InstructorProfile. */
export function findApprovedInstructorById(id: string) {
  return prisma.user.findFirst({
    where: { id, role: "INSTRUCTOR", instructorProfile: { approvalStatus: "APPROVED" } },
    include: {
      instructorProfile: true,
      _count: { select: { coursesInstructed: { where: { status: "PUBLISHED" } } } },
    },
  });
}

export function findPublishedCoursesByInstructor(instructorId: string) {
  return prisma.course.findMany({
    where: { instructorId, status: "PUBLISHED" },
    include: {
      category: true,
      instructor: true,
      reviews: { where: { hiddenAt: null }, select: { rating: true } },
      _count: { select: { enrollments: entitledEnrollmentsCount(), reviews: true } },
      sections: { select: { lessons: { select: { duration: true } } } },
    },
    orderBy: { publishedAt: "desc" },
  });
}

export function countEnrolledStudentsForInstructor(instructorId: string) {
  return prisma.enrollment.count({ where: { course: { instructorId } } });
}

export function findReviewRatingsForInstructor(instructorId: string) {
  return prisma.review.findMany({ where: { course: { instructorId } }, select: { rating: true } });
}

// ---------------------------------------------------------------------------
// Phase 14 — admin instructor management
// ---------------------------------------------------------------------------

type AdminInstructorFilters = {
  search?: string;
  approvalStatus?: "PENDING" | "APPROVED" | "REJECTED";
};

function buildAdminInstructorWhere(filters: AdminInstructorFilters) {
  return {
    role: "INSTRUCTOR" as const,
    ...(filters.approvalStatus && {
      instructorProfile: { approvalStatus: filters.approvalStatus },
    }),
    ...(filters.search && {
      OR: [
        { name: { contains: filters.search, mode: "insensitive" as const } },
        { email: { contains: filters.search, mode: "insensitive" as const } },
      ],
    }),
  };
}

/** Explicit select — never the raw User row (no passwordHash, sessions, etc). */
export function listInstructorsForAdmin(
  filters: AdminInstructorFilters,
  skip: number,
  take: number,
) {
  return prisma.user.findMany({
    where: buildAdminInstructorWhere(filters),
    orderBy: { createdAt: "desc" },
    skip,
    take,
    select: {
      id: true,
      name: true,
      email: true,
      avatar: true,
      avatarAssetId: true,
      createdAt: true,
      instructorProfile: { select: { approvalStatus: true, rejectionReason: true } },
    },
  });
}

export function countInstructorsForAdmin(filters: AdminInstructorFilters) {
  return prisma.user.count({ where: buildAdminInstructorWhere(filters) });
}

/** One query for every listed instructor's courses + entitled student counts (no N+1). */
export function coursesWithStudentCountsForInstructors(instructorIds: string[]) {
  return prisma.course.findMany({
    where: { instructorId: { in: instructorIds } },
    select: {
      id: true,
      instructorId: true,
      status: true,
      _count: {
        select: { enrollments: { where: { status: { in: [...ENTITLED_ENROLLMENT_STATUSES] } } } },
      },
    },
  });
}

export function findInstructorProfileForDecision(userId: string) {
  return prisma.instructorProfile.findUnique({
    where: { userId },
    select: { userId: true, approvalStatus: true },
  });
}

export function approveInstructorProfile(userId: string, adminId: string) {
  const now = new Date();
  return prisma.instructorProfile.update({
    where: { userId },
    data: {
      approvalStatus: "APPROVED",
      approvedAt: now,
      reviewedAt: now,
      reviewedById: adminId,
      rejectionReason: null,
    },
  });
}

export function rejectInstructorProfile(userId: string, adminId: string, reason: string) {
  return prisma.instructorProfile.update({
    where: { userId },
    data: {
      approvalStatus: "REJECTED",
      approvedAt: null,
      reviewedAt: new Date(),
      reviewedById: adminId,
      rejectionReason: reason,
    },
  });
}

// ---------------------------------------------------------------------------
// Phase 14 — instructor analytics (every function takes the SERVICE-derived instructorId)
// ---------------------------------------------------------------------------

export function coursesForAnalytics(instructorId: string) {
  return prisma.course.findMany({
    where: { instructorId },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, status: true },
  });
}

/** Enrollment counts per (course, status) for one instructor's courses in a single grouped query. */
export function enrollmentCountsByCourseStatus(instructorId: string) {
  return prisma.enrollment.groupBy({
    by: ["courseId", "status"],
    where: { course: { instructorId } },
    _count: { _all: true },
  });
}

export function entitledEnrollmentDatesSince(instructorId: string, since: Date) {
  return prisma.enrollment.findMany({
    where: {
      course: { instructorId },
      status: { in: [...ENTITLED_ENROLLMENT_STATUSES] },
      enrolledAt: { gte: since },
    },
    select: { enrolledAt: true },
  });
}

/** Visible (non-hidden) review stats per course, same rule as the public rating. */
export function visibleReviewStatsByCourse(instructorId: string) {
  return prisma.review.groupBy({
    by: ["courseId"],
    where: { course: { instructorId }, hiddenAt: null },
    _avg: { rating: true },
    _count: { _all: true },
  });
}

export function visibleRatingDistribution(instructorId: string) {
  return prisma.review.groupBy({
    by: ["rating"],
    where: { course: { instructorId }, hiddenAt: null },
    _count: { _all: true },
  });
}
