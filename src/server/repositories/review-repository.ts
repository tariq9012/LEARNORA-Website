import { prisma } from "../db/client";

/** Just enough reviewer info for public display — reused by every query below so the shape stays consistent. */
const REVIEW_AUTHOR_INCLUDE = {
  user: { include: { studentProfile: { select: { headline: true } } } },
} as const;

/** Recent reviews for a course, with just enough reviewer info for public display. */
export function findReviewsForCourse(courseId: string, take = 20) {
  return prisma.review.findMany({
    where: { courseId },
    include: REVIEW_AUTHOR_INCLUDE,
    orderBy: { createdAt: "desc" },
    take,
  });
}

/** Every rating for a course (no reviewer info) — used for the star breakdown, not just the displayed page. */
export function findAllRatingsForCourse(courseId: string) {
  return prisma.review.findMany({ where: { courseId }, select: { rating: true } });
}

export function findReviewByUserAndCourse(userId: string, courseId: string) {
  return prisma.review.findUnique({
    where: { userId_courseId: { userId, courseId } },
    include: REVIEW_AUTHOR_INCLUDE,
  });
}

/** Bare row, no author info — enough to verify ownership before an update/delete. */
export function findReviewById(id: string) {
  return prisma.review.findUnique({ where: { id } });
}

export function createReview(data: {
  userId: string;
  courseId: string;
  rating: number;
  comment: string | null;
}) {
  return prisma.review.create({ data, include: REVIEW_AUTHOR_INCLUDE });
}

export function updateReview(id: string, data: { rating: number; comment: string | null }) {
  return prisma.review.update({ where: { id }, data, include: REVIEW_AUTHOR_INCLUDE });
}

export function deleteReview(id: string) {
  return prisma.review.delete({ where: { id } });
}
