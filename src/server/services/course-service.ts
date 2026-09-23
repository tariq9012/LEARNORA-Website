import { formatLessonDuration, formatMonthYear } from "@/lib/format";

import { courseInputSchema } from "../validation/course";
import * as courseRepository from "../repositories/course-repository";
import type { CourseSort, PriceBucket } from "../repositories/course-repository";
import { lessonVideoUrl, publicAssetUrl } from "../media/media-urls";
import type { CourseCardDTO, CourseDetailDTO, CurriculumSectionDTO } from "../dto/course";
import { LEVEL_LABEL_TO_ENUM, mapCourseToCardDTO } from "./course-mapper";
import { getInstructorProfile } from "./instructor-service";
import { getRatingBreakdown, getReviewsForCourse } from "./review-service";
import type { CourseLevelLabel } from "../dto/course";

export class CourseValidationError extends Error {}

/** Converts the UI-facing level label (from a URL search param) to the Prisma enum, ignoring anything invalid. */
export function levelLabelToEnum(
  label: string | undefined,
): "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "ALL_LEVELS" | undefined {
  if (!label) return undefined;
  return LEVEL_LABEL_TO_ENUM[label as CourseLevelLabel];
}

export type CoursePage = {
  items: CourseCardDTO[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

const MAX_PAGE_SIZE = 48;
const DEFAULT_PAGE_SIZE = 6;

export async function browseCourses(params: {
  search?: string;
  categorySlug?: string;
  level?: string;
  priceBucket?: PriceBucket;
  sort?: CourseSort;
  page?: number;
  pageSize?: number;
}): Promise<CoursePage> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, params.pageSize ?? DEFAULT_PAGE_SIZE));
  const level = levelLabelToEnum(params.level);

  const filterParams = {
    ...(params.search !== undefined && { search: params.search }),
    ...(params.categorySlug !== undefined && { categorySlug: params.categorySlug }),
    ...(level !== undefined && { level }),
    ...(params.priceBucket !== undefined && { priceBucket: params.priceBucket }),
  };

  const totalItems = await courseRepository.countPublished(filterParams);

  const rows = await courseRepository.findManyPublished({
    ...filterParams,
    ...(params.sort !== undefined && { sort: params.sort }),
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  let items = rows.map(mapCourseToCardDTO);

  // "rating" sort can't be expressed as a DB-level ORDER BY on an averaged
  // relation field, so findManyPublished returned the *entire* matching
  // set for this one sort mode — sort and slice the page here instead.
  if (params.sort === "rating") {
    items = [...items]
      .sort((a, b) => b.rating - a.rating)
      .slice((page - 1) * pageSize, page * pageSize);
  }

  return {
    items,
    page,
    pageSize,
    totalItems,
    totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
  };
}

export async function getFeaturedCourses(limit = 6): Promise<CourseCardDTO[]> {
  const rows = await courseRepository.findFeaturedPublished(limit);
  return rows.map(mapCourseToCardDTO);
}

export async function getCourseBySlug(slug: string): Promise<CourseDetailDTO | null> {
  const course = await courseRepository.findPublishedCourseBySlug(slug);
  if (!course) return null;

  const sections: CurriculumSectionDTO[] = course.sections.map((section) => ({
    id: section.id,
    title: section.title,
    lessons: section.lessons.map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      duration: formatLessonDuration(lesson.duration),
      preview: lesson.isPreview,
      // Only a free-preview lesson's video is safe to hand to a
      // logged-out visitor — everything else requires enrollment, which
      // the /media/lesson-video route enforces itself regardless of what
      // this DTO sends, so this is a UX nicety, not the security boundary.
      previewVideoUrl: lesson.isPreview
        ? lesson.videoAssetId
          ? lessonVideoUrl(lesson.videoAssetId)
          : (lesson.videoUrl ?? null)
        : null,
    })),
  }));

  const [instructorData, reviews, ratingBreakdown] = await Promise.all([
    getInstructorProfile(course.instructorId),
    getReviewsForCourse(course.id),
    getRatingBreakdown(course.id),
  ]);

  const card = mapCourseToCardDTO(course);
  const updatedAt = course.publishedAt ?? course.updatedAt;

  return {
    ...card,
    subtitle: course.subtitle ?? "",
    description: course.description ?? "",
    language: course.language,
    updated: formatMonthYear(updatedAt),
    outcomes: course.learningOutcomes,
    requirements: course.requirements,
    curriculum: sections,
    instructorProfile: instructorData?.instructor ?? null,
    reviews,
    ratingBreakdown,
    previewVideoUrl: course.previewAssetId ? publicAssetUrl(course.previewAssetId) : course.previewVideo,
  };
}

/**
 * Creates a new course in DRAFT status for an instructor. Validates input
 * with Zod and enforces slug uniqueness before touching the database.
 */
export async function createDraftCourse(instructorId: string, input: unknown) {
  const data = courseInputSchema.parse(input);

  if (await courseRepository.courseSlugExists(data.slug)) {
    throw new CourseValidationError(`A course with slug "${data.slug}" already exists`);
  }

  return courseRepository.createCourse({
    title: data.title,
    slug: data.slug,
    subtitle: data.subtitle,
    description: data.description,
    thumbnail: data.thumbnail,
    previewVideo: data.previewVideo,
    level: data.level,
    language: data.language,
    price: data.price,
    discountPrice: data.discountPrice,
    requirements: data.requirements,
    learningOutcomes: data.learningOutcomes,
    targetAudience: data.targetAudience,
    status: "DRAFT",
    instructor: { connect: { id: instructorId } },
    category: { connect: { id: data.categoryId } },
  });
}

/** Admin moderation: move a course from PENDING_REVIEW to PUBLISHED or REJECTED. */
export async function moderateCourse(
  courseId: string,
  decision: "APPROVE" | "REJECT",
  rejectionReason?: string,
) {
  if (decision === "REJECT" && !rejectionReason) {
    throw new CourseValidationError("A rejection reason is required when rejecting a course");
  }
  return courseRepository.updateCourseStatus(
    courseId,
    decision === "APPROVE" ? "PUBLISHED" : "REJECTED",
    rejectionReason,
  );
}
