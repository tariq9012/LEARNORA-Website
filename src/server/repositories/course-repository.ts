import type { Prisma } from "../../generated/prisma/client";

import { prisma } from "../db/client";
import { entitledEnrollmentsCount } from "../services/enrollment-policy";

/**
 * Repositories are the only layer allowed to talk to Prisma directly.
 * Services call these functions instead of importing `prisma` themselves,
 * which keeps query shape/ownership in one place per model.
 */

const CARD_SELECT_INCLUDE = {
  category: true,
  instructor: true,
  // Ratings are averaged in the service layer rather than in SQL — Prisma
  // has no `_avg` over a to-many relation in the same query, and at this
  // catalog's scale (tens of reviews per course) pulling the ratings array
  // alongside the row is simpler than a second round-trip per course.
  reviews: { where: { hiddenAt: null }, select: { rating: true } },
  _count: { select: { enrollments: entitledEnrollmentsCount(), reviews: true } },
  // Only durations, not full lesson content — enough to sum a total
  // runtime for the card badge without bloating the list payload.
  sections: { select: { lessons: { select: { duration: true } } } },
  // thumbnailAssetId/thumbnail are plain scalar columns on Course, so
  // `include` already returns them alongside these relations — resolved
  // to a thumbnailUrl (Asset first, legacy URL fallback) in the service
  // layer, see course-mapper.ts.
} as const;

export type CourseSort = "popular" | "newest" | "rating" | "price_asc" | "price_desc";
export type PriceBucket = "under_40" | "40_60" | "over_60";

/** Effective price is COALESCE(discountPrice, price) — the bucket filters compare against that, not the raw list price. */
function priceBucketWhere(bucket: PriceBucket): Prisma.CourseWhereInput {
  const range =
    bucket === "under_40" ? { lt: 40 } : bucket === "40_60" ? { gte: 40, lte: 60 } : { gt: 60 };
  return {
    OR: [{ discountPrice: range }, { AND: [{ discountPrice: null }, { price: range }] }],
  };
}

function buildPublishedWhere(params: {
  search?: string;
  categorySlug?: string;
  level?: Prisma.CourseWhereInput["level"];
  instructorId?: string;
  priceBucket?: PriceBucket;
}): Prisma.CourseWhereInput {
  const search = params.search?.trim();
  // search and priceBucket both need their own OR clause — combining them
  // via top-level spread would let one silently clobber the other's `OR`
  // key, so each becomes its own entry in an `AND` array instead.
  const conditions: Prisma.CourseWhereInput[] = [];
  if (search) {
    conditions.push({
      OR: [
        { title: { contains: search, mode: "insensitive" } },
        { subtitle: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ],
    });
  }
  if (params.priceBucket) {
    conditions.push(priceBucketWhere(params.priceBucket));
  }

  return {
    status: "PUBLISHED",
    ...(params.categorySlug && { category: { slug: params.categorySlug } }),
    ...(params.level && { level: params.level }),
    ...(params.instructorId && { instructorId: params.instructorId }),
    ...(conditions.length > 0 && { AND: conditions }),
  };
}

function sortToOrderBy(sort: CourseSort | undefined): Prisma.CourseOrderByWithRelationInput {
  switch (sort) {
    case "newest":
      return { publishedAt: "desc" };
    case "price_asc":
      return { price: "asc" };
    case "price_desc":
      return { price: "desc" };
    case "popular":
      return { enrollments: { _count: "desc" } };
    // "rating" has no native DB-level ordering here (see buildPublishedWhere
    // comment) — the service layer sorts the fetched page by computed
    // average rating instead. This function is never called for that case.
    default:
      return { enrollments: { _count: "desc" } };
  }
}

export function findPublishedCourseBySlug(slug: string) {
  return prisma.course.findFirst({
    where: { slug, status: "PUBLISHED" },
    include: {
      category: true,
      instructor: { include: { instructorProfile: true } },
      reviews: { where: { hiddenAt: null }, select: { rating: true } },
      _count: { select: { enrollments: entitledEnrollmentsCount(), reviews: true } },
      sections: {
        orderBy: { position: "asc" },
        include: { lessons: { orderBy: { position: "asc" } } },
      },
    },
  });
}

/**
 * Looks up a course by slug for the *learning* route — deliberately not
 * filtered to status: "PUBLISHED". A student who already enrolled keeps
 * access to their course content even if it's later archived; the real
 * access boundary is the Enrollment row itself, checked by the caller.
 */
export function findCourseBySlugForLearning(slug: string) {
  return prisma.course.findFirst({
    where: { slug },
    select: {
      id: true,
      slug: true,
      title: true,
      price: true,
      discountPrice: true,
      status: true,
      instructorId: true,
      thumbnail: true,
      thumbnailAssetId: true,
      category: { select: { slug: true } },
      instructor: { select: { name: true } },
      sections: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          title: true,
          position: true,
          lessons: {
            orderBy: { position: "asc" },
            select: {
              id: true,
              title: true,
              description: true,
              type: true,
              duration: true,
              position: true,
              videoAssetId: true,
              videoUrl: true,
              resources: {
                orderBy: { position: "asc" },
                select: {
                  id: true,
                  title: true,
                  assetId: true,
                  asset: { select: { originalFilename: true, sizeBytes: true } },
                },
              },
            },
          },
        },
      },
    },
  });
}

/**
 * Fetches one page of published courses matching the given filters.
 * For sort === "rating", `take`/`skip` are ignored here and the full
 * matching set is returned for the service to sort and paginate in
 * memory — see the note on sortToOrderBy above.
 */
export function findManyPublished(params: {
  search?: string;
  categorySlug?: string;
  level?: Prisma.CourseWhereInput["level"];
  instructorId?: string;
  priceBucket?: PriceBucket;
  sort?: CourseSort;
  skip: number;
  take: number;
}) {
  const where = buildPublishedWhere(params);

  if (params.sort === "rating") {
    return prisma.course.findMany({ where, include: CARD_SELECT_INCLUDE });
  }

  return prisma.course.findMany({
    where,
    include: CARD_SELECT_INCLUDE,
    orderBy: sortToOrderBy(params.sort),
    skip: params.skip,
    take: params.take,
  });
}

export function countPublished(params: {
  search?: string;
  categorySlug?: string;
  level?: Prisma.CourseWhereInput["level"];
  priceBucket?: PriceBucket;
}) {
  return prisma.course.count({ where: buildPublishedWhere(params) });
}

export function findFeaturedPublished(take: number) {
  return prisma.course.findMany({
    where: { status: "PUBLISHED", featured: true },
    include: CARD_SELECT_INCLUDE,
    orderBy: { publishedAt: "desc" },
    take,
  });
}

export function createCourse(data: Prisma.CourseCreateInput) {
  return prisma.course.create({ data });
}

export function updateCourseStatus(
  courseId: string,
  status: "DRAFT" | "PENDING_REVIEW" | "PUBLISHED" | "REJECTED" | "ARCHIVED",
  rejectionReason?: string,
) {
  return prisma.course.update({
    where: { id: courseId },
    data: {
      status,
      rejectionReason: status === "REJECTED" ? rejectionReason : null,
      publishedAt: status === "PUBLISHED" ? new Date() : undefined,
    },
  });
}

export function courseSlugExists(slug: string, excludeCourseId?: string) {
  return prisma.course
    .findFirst({
      where: { slug, ...(excludeCourseId && { id: { not: excludeCourseId } }) },
      select: { id: true },
    })
    .then(Boolean);
}

export function countLessonsForCourse(courseId: string) {
  return prisma.lesson.count({ where: { section: { courseId } } });
}
