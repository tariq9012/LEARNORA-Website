import { prisma } from "../db/client";
import { entitledEnrollmentsCount } from "../services/enrollment-policy";

const LIST_INCLUDE = {
  category: true,
  reviews: { where: { hiddenAt: null }, select: { rating: true } },
  _count: { select: { enrollments: entitledEnrollmentsCount(), reviews: true, sections: true } },
} as const;

export function findCoursesByInstructor(instructorId: string) {
  return prisma.course.findMany({
    where: { instructorId },
    include: LIST_INCLUDE,
    orderBy: { updatedAt: "desc" },
  });
}

/** Fetches a course only if it belongs to the given instructor — returns null otherwise (never leaks existence of another instructor's course). */
export function findOwnedCourse(courseId: string, instructorId: string) {
  return prisma.course.findFirst({
    where: { id: courseId, instructorId },
    include: {
      category: true,
      thumbnailAsset: true,
      previewAsset: true,
      sections: {
        orderBy: { position: "asc" },
        include: {
          lessons: {
            orderBy: { position: "asc" },
            include: {
              videoAsset: true,
              resources: { orderBy: { position: "asc" }, include: { asset: true } },
            },
          },
        },
      },
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

export function createDraftCourse(data: {
  title: string;
  slug: string;
  subtitle?: string | undefined;
  description?: string | undefined;
  categoryId: string;
  level: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "ALL_LEVELS";
  language: string;
  instructorId: string;
}) {
  return prisma.course.create({
    data: {
      title: data.title,
      slug: data.slug,
      subtitle: data.subtitle,
      description: data.description,
      level: data.level,
      language: data.language,
      price: 0,
      status: "DRAFT",
      instructor: { connect: { id: data.instructorId } },
      category: { connect: { id: data.categoryId } },
    },
  });
}

export function updateCourseMetadata(courseId: string, data: Record<string, unknown>) {
  return prisma.course.update({ where: { id: courseId }, data });
}

/** Hard delete — only ever called for DRAFT/REJECTED courses (enforced by the service). */
export function deleteCourse(courseId: string) {
  return prisma.course.delete({ where: { id: courseId } });
}

export function archiveCourse(courseId: string) {
  return prisma.course.update({ where: { id: courseId }, data: { status: "ARCHIVED" } });
}

/**
 * Conditional status transition — the `where` includes the expected
 * current status, so this only succeeds if nothing else changed the row
 * first (handles the double-submit / concurrent-review race safely).
 * Returns the count of updated rows (0 means the transition didn't apply).
 */
export function transitionStatus(
  courseId: string,
  fromStatuses: Array<"DRAFT" | "PENDING_REVIEW" | "PUBLISHED" | "REJECTED" | "ARCHIVED">,
  data: Record<string, unknown>,
) {
  return prisma.course.updateMany({
    where: { id: courseId, status: { in: fromStatuses } },
    data,
  });
}
