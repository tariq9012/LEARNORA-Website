import { prisma } from "../db/client";

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
      reviews: { select: { rating: true } },
      _count: { select: { enrollments: true, reviews: true } },
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
