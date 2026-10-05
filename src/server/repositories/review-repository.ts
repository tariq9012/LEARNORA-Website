import { prisma } from "../db/client";

/** Just enough reviewer info for public display — reused by every query below so the shape stays consistent. */
const REVIEW_AUTHOR_INCLUDE = {
  user: { include: { studentProfile: { select: { headline: true } } } },
} as const;

/** Recent reviews for a course, with just enough reviewer info for public display. */
/** Public listing: excludes admin-hidden reviews (Phase 12 moderation). */
export function findReviewsForCourse(courseId: string, take = 20) {
  return prisma.review.findMany({
    where: { courseId, hiddenAt: null },
    include: REVIEW_AUTHOR_INCLUDE,
    orderBy: { createdAt: "desc" },
    take,
  });
}

/** Every rating for a course (no reviewer info) — used for the star breakdown, not just the displayed page. */
/** Rating breakdown source: excludes hidden reviews, so a hidden review never moves the public average/count. */
export function findAllRatingsForCourse(courseId: string) {
  return prisma.review.findMany({ where: { courseId, hiddenAt: null }, select: { rating: true } });
}

/** Admin moderation detail: the LIVE review regardless of hidden state (an admin must see what they are hiding/restoring). */
export function findByIdForModeration(id: string) {
  return prisma.review.findUnique({
    where: { id },
    include: { user: { select: { name: true } }, course: { select: { title: true } } },
  });
}

/** Conditional: only hides a currently-visible review. */
export function hideReview(id: string) {
  return prisma.review.updateMany({
    where: { id, hiddenAt: null },
    data: { hiddenAt: new Date() },
  });
}

/** Conditional: only restores a currently-hidden review. */
export function restoreReview(id: string) {
  return prisma.review.updateMany({
    where: { id, hiddenAt: { not: null } },
    data: { hiddenAt: null },
  });
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

// ---------------------------------------------------------------------------
// Phase 14 — admin + instructor review listings
// ---------------------------------------------------------------------------

export type ReviewListFilters = {
  search?: string;
  courseId?: string;
  rating?: number;
  visibility?: "visible" | "hidden";
  /** Set by the SERVICE from the session for the instructor view — restricts to reviews on courses this instructor owns. */
  instructorId?: string;
  order?: "newest" | "oldest";
};

function buildReviewListWhere(filters: ReviewListFilters) {
  return {
    ...(filters.courseId && { courseId: filters.courseId }),
    ...(filters.rating && { rating: filters.rating }),
    ...(filters.visibility === "visible" && { hiddenAt: null }),
    ...(filters.visibility === "hidden" && { hiddenAt: { not: null } }),
    ...(filters.instructorId && { course: { instructorId: filters.instructorId } }),
    ...(filters.search && {
      OR: [
        { comment: { contains: filters.search, mode: "insensitive" as const } },
        { user: { name: { contains: filters.search, mode: "insensitive" as const } } },
        { course: { title: { contains: filters.search, mode: "insensitive" as const } } },
      ],
    }),
  };
}

export function listReviewsForListing(filters: ReviewListFilters, skip: number, take: number) {
  return prisma.review.findMany({
    where: buildReviewListWhere(filters),
    orderBy: { createdAt: filters.order === "oldest" ? "asc" : "desc" },
    skip,
    take,
    select: {
      id: true,
      rating: true,
      comment: true,
      createdAt: true,
      hiddenAt: true,
      courseId: true,
      user: { select: { name: true } },
      course: { select: { title: true } },
    },
  });
}

export function countReviewsForListing(filters: ReviewListFilters) {
  return prisma.review.count({ where: buildReviewListWhere(filters) });
}
