import { averageRating, formatDurationHM } from "@/lib/format";

import { publicAssetUrl } from "../media/media-urls";
import type { CourseCardDTO, CourseLevelLabel } from "../dto/course";

export const LEVEL_ENUM_TO_LABEL: Record<string, CourseLevelLabel> = {
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
  ALL_LEVELS: "All levels",
};

export const LEVEL_LABEL_TO_ENUM: Record<
  CourseLevelLabel,
  "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "ALL_LEVELS"
> = {
  Beginner: "BEGINNER",
  Intermediate: "INTERMEDIATE",
  Advanced: "ADVANCED",
  "All levels": "ALL_LEVELS",
};

export type CourseWithCardRelations = {
  slug: string;
  title: string;
  level: string;
  price: unknown; // Prisma.Decimal — converted with Number() below
  discountPrice: unknown;
  // Asset-backed uploads (Phase 7) take priority; the legacy pasted-URL
  // field is a fallback for courses that predate real uploads — see the
  // Phase 7 report, "Legacy URL compatibility".
  thumbnailAssetId: string | null;
  thumbnail: string | null;
  category: { slug: string; name: string };
  instructor: { name: string };
  reviews: { rating: number }[];
  _count: { enrollments: number; reviews: number };
  sections: { lessons: { duration: number | null }[] }[];
};

function totalDurationSeconds(sections: { lessons: { duration: number | null }[] }[]): number {
  return sections.flatMap((s) => s.lessons).reduce((sum, l) => sum + (l.duration ?? 0), 0);
}

function priceFields(
  price: unknown,
  discountPrice: unknown,
): { price: number; originalPrice?: number } {
  const base = Number(price);
  const discount = discountPrice != null ? Number(discountPrice) : null;
  if (discount != null && discount < base) {
    return { price: discount, originalPrice: base };
  }
  return { price: base };
}

export function mapCourseToCardDTO(course: CourseWithCardRelations): CourseCardDTO {
  return {
    id: course.slug,
    title: course.title,
    categorySlug: course.category.slug,
    category: course.category.name,
    instructor: course.instructor.name,
    level: LEVEL_ENUM_TO_LABEL[course.level] ?? "All levels",
    duration: formatDurationHM(totalDurationSeconds(course.sections)),
    rating: averageRating(course.reviews.map((r) => r.rating)),
    reviewCount: course._count.reviews,
    students: course._count.enrollments,
    thumbnailUrl: course.thumbnailAssetId
      ? publicAssetUrl(course.thumbnailAssetId)
      : course.thumbnail,
    ...priceFields(course.price, course.discountPrice),
  };
}
