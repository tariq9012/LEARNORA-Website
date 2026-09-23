import { prisma } from "../db/client";

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
    include: {
      category: true,
      instructor: true,
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

export function countCoursesByStatus() {
  return prisma.course.groupBy({ by: ["status"], _count: { _all: true } });
}
