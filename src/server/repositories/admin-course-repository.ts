import { prisma } from "../db/client";
import { ENTITLED_ENROLLMENT_STATUSES } from "../services/enrollment-policy";

const REVIEW_INCLUDE = {
  category: true,
  instructor: { include: { instructorProfile: true } },
  sections: {
    orderBy: { position: "asc" as const },
    include: {
      lessons: {
        orderBy: { position: "asc" as const },
        include: { _count: { select: { resources: true } } },
      },
    },
  },
} as const;

export function findPendingCourses() {
  return prisma.course.findMany({
    where: { status: "PENDING_REVIEW" },
    // Phase 15: bounded review queue (oldest first, so nothing starves).
    take: 100,
    include: {
      category: true,
      instructor: { select: { name: true } },
      _count: { select: { sections: true } },
    },
    orderBy: { submittedAt: "asc" },
  });
}

/** Full detail for the admin review screen — not gated by PUBLISHED like the public getter. */
export function findCourseForReview(courseId: string) {
  return prisma.course.findUnique({ where: { id: courseId }, include: REVIEW_INCLUDE });
}

/** Conditional: only succeeds if the course is still PENDING_REVIEW when this runs. */
export function approveCourse(courseId: string, adminId: string) {
  return prisma.course.updateMany({
    where: { id: courseId, status: "PENDING_REVIEW" },
    data: {
      status: "PUBLISHED",
      publishedAt: new Date(),
      reviewedAt: new Date(),
      reviewedById: adminId,
      rejectionReason: null,
    },
  });
}

export function rejectCourse(courseId: string, adminId: string, reason: string) {
  return prisma.course.updateMany({
    where: { id: courseId, status: "PENDING_REVIEW" },
    data: {
      status: "REJECTED",
      rejectionReason: reason,
      reviewedAt: new Date(),
      reviewedById: adminId,
    },
  });
}

/** What a review notification needs: owner, title, the review time (event identity) and the instructor-facing reason. */
export function findReviewOutcome(courseId: string) {
  return prisma.course.findUnique({
    where: { id: courseId },
    select: { title: true, instructorId: true, reviewedAt: true, rejectionReason: true },
  });
}

export function countCoursesByStatus() {
  return prisma.course.groupBy({ by: ["status"], _count: { _all: true } });
}

// ---------------------------------------------------------------------------
// Phase 14 — bounded admin course listing
// ---------------------------------------------------------------------------

export type AdminCourseWhere = {
  status?: "DRAFT" | "PENDING_REVIEW" | "PUBLISHED" | "REJECTED" | "ARCHIVED";
  categoryId?: string;
  instructorId?: string;
  search?: string;
};

function buildAdminCourseWhere(filters: AdminCourseWhere) {
  return {
    ...(filters.status && { status: filters.status }),
    ...(filters.categoryId && { categoryId: filters.categoryId }),
    ...(filters.instructorId && { instructorId: filters.instructorId }),
    ...(filters.search && {
      OR: [
        { title: { contains: filters.search, mode: "insensitive" as const } },
        { instructor: { name: { contains: filters.search, mode: "insensitive" as const } } },
      ],
    }),
  };
}

export function listCoursesForAdmin(filters: AdminCourseWhere, skip: number, take: number) {
  return prisma.course.findMany({
    where: buildAdminCourseWhere(filters),
    orderBy: { createdAt: "desc" },
    skip,
    take,
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      price: true,
      createdAt: true,
      publishedAt: true,
      category: { select: { name: true } },
      instructor: { select: { id: true, name: true } },
      // Only entitled enrollments count as "students" — same rule as
      // entitledEnrollmentsCount() in enrollment-policy.ts (a cancelled
      // enrollment, e.g. after a refund, is not a current student).
      _count: {
        select: { enrollments: { where: { status: { in: [...ENTITLED_ENROLLMENT_STATUSES] } } } },
      },
    },
  });
}

export function countCoursesForAdmin(filters: AdminCourseWhere) {
  return prisma.course.count({ where: buildAdminCourseWhere(filters) });
}

/** One grouped query for the whole page's rating stats (no N+1). Hidden reviews are excluded, same as the public rating. */
export function visibleRatingStatsForCourses(courseIds: string[]) {
  return prisma.review.groupBy({
    by: ["courseId"],
    where: { courseId: { in: courseIds }, hiddenAt: null },
    _avg: { rating: true },
    _count: { _all: true },
  });
}
