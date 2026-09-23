import { averageRating } from "@/lib/format";

import * as courseRepository from "../repositories/instructor-course-repository";
import * as sectionRepository from "../repositories/course-section-repository";
import * as lessonRepository from "../repositories/lesson-repository";
import { slugify, withUniqueSuffix } from "../utils/slug";
import { lessonResourceUrl, lessonVideoUrl, publicAssetUrl } from "../media/media-urls";
import type { ApprovedInstructor } from "../auth/instructor-guard";
import type { SafeUser } from "../auth/types";
import type { AssetDTO } from "../dto/media";
import {
  courseBasicsSchema,
  courseMetadataUpdateSchema,
  lessonCreateSchema,
  lessonUpdateSchema,
  reorderSchema,
  sectionCreateSchema,
  sectionUpdateSchema,
} from "../validation/instructor-course";
import type {
  BuilderSectionDTO,
  CourseBuilderDTO,
  CourseCompletenessResult,
  InstructorCourseListItemDTO,
} from "../dto/instructor-course";

export class CourseOwnershipError extends Error {
  constructor() {
    super("Course not found.");
  }
}
export class CourseStateError extends Error {}

// A DRAFT or REJECTED course is the instructor's to edit freely. Once it's
// PENDING_REVIEW or PUBLISHED, metadata/curriculum edits are locked until
// review completes (or, for PUBLISHED, until a later versioning phase).
const EDITABLE_STATUSES = ["DRAFT", "REJECTED"] as const;
const SUBMITTABLE_STATUSES = ["DRAFT", "REJECTED"] as const;

export function isEditable(status: string): boolean {
  return (EDITABLE_STATUSES as readonly string[]).includes(status);
}

async function generateUniqueSlug(title: string): Promise<string> {
  const base = slugify(title) || "course";
  if (!(await courseRepository.courseSlugExists(base))) return base;
  // Deterministic fallback: keep retrying with a fresh random suffix until
  // one isn't taken. Collisions here are rare enough that this is fine.
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = withUniqueSuffix(base);
    if (!(await courseRepository.courseSlugExists(candidate))) return candidate;
  }
  throw new CourseStateError("Could not generate a unique course URL. Try a different title.");
}

async function loadOwnedCourseOrThrow(courseId: string, instructor: { id: string }) {
  const course = await courseRepository.findOwnedCourse(courseId, instructor.id);
  if (!course) throw new CourseOwnershipError();
  return course;
}

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

export async function getInstructorCourses(
  instructor: SafeUser,
): Promise<InstructorCourseListItemDTO[]> {
  const rows = await courseRepository.findCoursesByInstructor(instructor.id);
  return rows.map((c) => ({
    id: c.id,
    title: c.title,
    thumbnail: c.thumbnail,
    status: c.status,
    category: c.category.name,
    level: c.level,
    price: Number(c.discountPrice ?? c.price),
    students: c._count.enrollments,
    rating: averageRating(c.reviews.map((r) => r.rating)),
    reviewCount: c._count.reviews,
    sectionCount: c._count.sections,
    updatedAt: c.updatedAt.toISOString(),
    rejectionReason: c.rejectionReason,
    slug: c.slug,
  }));
}

// ---------------------------------------------------------------------------
// Builder DTO mapping
// ---------------------------------------------------------------------------

type OwnedCourse = Awaited<ReturnType<typeof courseRepository.findOwnedCourse>>;

function toAssetDTO(
  asset: { id: string; originalFilename: string; mimeType: string; sizeBytes: number } | null,
  url: (assetId: string) => string,
): AssetDTO | null {
  if (!asset) return null;
  return {
    assetId: asset.id,
    originalFilename: asset.originalFilename,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
    url: url(asset.id),
  };
}

function mapToBuilderDTO(course: NonNullable<OwnedCourse>): CourseBuilderDTO {
  const sections: BuilderSectionDTO[] = course.sections.map((s) => ({
    id: s.id,
    title: s.title,
    description: s.description ?? "",
    lessons: s.lessons.map((l) => ({
      id: l.id,
      title: l.title,
      description: l.description ?? "",
      type: l.type,
      videoUrl: l.videoUrl ?? "",
      content: l.content ?? "",
      duration: l.duration,
      isPreview: l.isPreview,
      video: toAssetDTO(l.videoAsset, lessonVideoUrl),
      resources: l.resources.map((r) => ({
        id: r.id,
        title: r.title,
        originalFilename: r.asset.originalFilename,
        sizeBytes: r.asset.sizeBytes,
        downloadUrl: lessonResourceUrl(r.assetId),
      })),
    })),
  }));

  return {
    id: course.id,
    title: course.title,
    slug: course.slug,
    subtitle: course.subtitle ?? "",
    description: course.description ?? "",
    categoryId: course.categoryId,
    categorySlug: course.category.slug,
    level: course.level,
    language: course.language,
    thumbnail: course.thumbnail ?? "",
    previewVideo: course.previewVideo ?? "",
    thumbnailAsset: toAssetDTO(course.thumbnailAsset, publicAssetUrl),
    previewAsset: toAssetDTO(course.previewAsset, publicAssetUrl),
    price: Number(course.price),
    discountPrice: course.discountPrice != null ? Number(course.discountPrice) : null,
    learningOutcomes: course.learningOutcomes,
    requirements: course.requirements,
    targetAudience: course.targetAudience,
    status: course.status,
    rejectionReason: course.rejectionReason,
    submittedAt: course.submittedAt?.toISOString() ?? null,
    reviewedAt: course.reviewedAt?.toISOString() ?? null,
    publishedAt: course.publishedAt?.toISOString() ?? null,
    updatedAt: course.updatedAt.toISOString(),
    sections,
    editable: isEditable(course.status),
  };
}

export async function getCourseForBuilder(
  instructor: SafeUser,
  courseId: string,
): Promise<CourseBuilderDTO> {
  const course = await loadOwnedCourseOrThrow(courseId, instructor);
  return mapToBuilderDTO(course);
}

// ---------------------------------------------------------------------------
// Create / update metadata
// ---------------------------------------------------------------------------

export async function createDraftCourse(
  instructor: ApprovedInstructor,
  input: unknown,
): Promise<{ id: string }> {
  const data = courseBasicsSchema.parse(input);
  const slug = await generateUniqueSlug(data.title);
  const course = await courseRepository.createDraftCourse({
    ...data,
    slug,
    instructorId: instructor.id,
  });
  return { id: course.id };
}

export async function updateCourseMetadata(
  instructor: ApprovedInstructor,
  courseId: string,
  input: unknown,
): Promise<void> {
  const course = await loadOwnedCourseOrThrow(courseId, instructor);
  if (!isEditable(course.status)) {
    throw new CourseStateError(
      course.status === "PENDING_REVIEW"
        ? "This course is currently under review and can't be edited."
        : "Published courses can't be edited directly yet.",
    );
  }

  const data = courseMetadataUpdateSchema.parse(input);
  // Title changes don't retroactively change the slug — the slug is the
  // course's stable public URL once created.
  await courseRepository.updateCourseMetadata(courseId, data);
}

export async function deleteDraftCourse(
  instructor: ApprovedInstructor,
  courseId: string,
): Promise<void> {
  const course = await loadOwnedCourseOrThrow(courseId, instructor);
  if (!isEditable(course.status)) {
    throw new CourseStateError(
      "Only draft or rejected courses can be deleted. Archive a published course instead.",
    );
  }
  await courseRepository.deleteCourse(courseId);
}

export async function archiveCourse(
  instructor: ApprovedInstructor,
  courseId: string,
): Promise<void> {
  const course = await loadOwnedCourseOrThrow(courseId, instructor);
  if (course.status !== "PUBLISHED") {
    throw new CourseStateError("Only a published course can be archived.");
  }
  await courseRepository.archiveCourse(courseId);
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

async function assertEditableOwnedCourse(instructor: ApprovedInstructor, courseId: string) {
  const course = await loadOwnedCourseOrThrow(courseId, instructor);
  if (!isEditable(course.status)) {
    throw new CourseStateError("This course can't be edited right now.");
  }
  return course;
}

export async function createSection(
  instructor: ApprovedInstructor,
  courseId: string,
  input: unknown,
) {
  await assertEditableOwnedCourse(instructor, courseId);
  const data = sectionCreateSchema.parse(input);
  return sectionRepository.createSection(courseId, data);
}

export async function updateSection(
  instructor: ApprovedInstructor,
  courseId: string,
  sectionId: string,
  input: unknown,
) {
  await assertEditableOwnedCourse(instructor, courseId);
  const section = await sectionRepository.findSectionWithCourseId(sectionId);
  if (!section || section.courseId !== courseId) throw new CourseOwnershipError();
  const data = sectionUpdateSchema.parse(input);
  return sectionRepository.updateSection(sectionId, data);
}

export async function deleteSection(
  instructor: ApprovedInstructor,
  courseId: string,
  sectionId: string,
) {
  await assertEditableOwnedCourse(instructor, courseId);
  const section = await sectionRepository.findSectionWithCourseId(sectionId);
  if (!section || section.courseId !== courseId) throw new CourseOwnershipError();
  await sectionRepository.deleteSection(sectionId);
}

export async function reorderSections(
  instructor: ApprovedInstructor,
  courseId: string,
  input: unknown,
) {
  const course = await assertEditableOwnedCourse(instructor, courseId);
  const { orderedIds } = reorderSchema.parse(input);

  const ownedIds = new Set(course.sections.map((s) => s.id));
  // Every check matters independently: length catches missing/extra IDs,
  // the Set-size check catches a duplicated ID standing in for a missing
  // one (same length, still "every ID owned", but not a valid
  // permutation), and `.every` catches IDs from another course.
  if (
    orderedIds.length !== ownedIds.size ||
    new Set(orderedIds).size !== orderedIds.length ||
    !orderedIds.every((id) => ownedIds.has(id))
  ) {
    throw new CourseStateError(
      "The section list doesn't match this course. Refresh and try again.",
    );
  }

  await sectionRepository.reorderSections(courseId, orderedIds);
}

// ---------------------------------------------------------------------------
// Lessons
// ---------------------------------------------------------------------------

async function assertOwnedSection(
  instructor: ApprovedInstructor,
  courseId: string,
  sectionId: string,
) {
  const course = await assertEditableOwnedCourse(instructor, courseId);
  const section = course.sections.find((s) => s.id === sectionId);
  if (!section) throw new CourseOwnershipError();
  return section;
}

export async function createLesson(
  instructor: ApprovedInstructor,
  courseId: string,
  sectionId: string,
  input: unknown,
) {
  await assertOwnedSection(instructor, courseId, sectionId);
  const data = lessonCreateSchema.parse(input);
  return lessonRepository.createLesson(sectionId, data);
}

export async function updateLesson(
  instructor: ApprovedInstructor,
  courseId: string,
  lessonId: string,
  input: unknown,
) {
  await assertEditableOwnedCourse(instructor, courseId);
  const lesson = await lessonRepository.findLessonWithOwnership(lessonId);
  if (!lesson || lesson.section.courseId !== courseId) throw new CourseOwnershipError();
  const data = lessonUpdateSchema.parse(input);
  return lessonRepository.updateLesson(lessonId, data);
}

export async function deleteLesson(
  instructor: ApprovedInstructor,
  courseId: string,
  lessonId: string,
) {
  await assertEditableOwnedCourse(instructor, courseId);
  const lesson = await lessonRepository.findLessonWithOwnership(lessonId);
  if (!lesson || lesson.section.courseId !== courseId) throw new CourseOwnershipError();
  await lessonRepository.deleteLesson(lessonId);
}

export async function reorderLessons(
  instructor: ApprovedInstructor,
  courseId: string,
  sectionId: string,
  input: unknown,
) {
  const section = await assertOwnedSection(instructor, courseId, sectionId);
  const { orderedIds } = reorderSchema.parse(input);

  const ownedIds = new Set(section.lessons.map((l) => l.id));
  if (
    orderedIds.length !== ownedIds.size ||
    new Set(orderedIds).size !== orderedIds.length ||
    !orderedIds.every((id) => ownedIds.has(id))
  ) {
    throw new CourseStateError(
      "The lesson list doesn't match this section. Refresh and try again.",
    );
  }

  await lessonRepository.reorderLessons(sectionId, orderedIds);
}

// ---------------------------------------------------------------------------
// Completeness & submission
// ---------------------------------------------------------------------------

function checkCompleteness(course: NonNullable<OwnedCourse>): CourseCompletenessResult {
  const issues: string[] = [];
  if (!course.description || course.description.trim().length < 20) {
    issues.push("Add a course description (at least 20 characters).");
  }
  if (!course.thumbnailAssetId && !course.thumbnail) {
    issues.push("Upload a course thumbnail.");
  }
  if (course.sections.length === 0) {
    issues.push("Add at least one section.");
  }
  const totalLessons = course.sections.reduce((sum, s) => sum + s.lessons.length, 0);
  if (totalLessons === 0) {
    issues.push("Add at least one lesson.");
  }
  for (const section of course.sections) {
    for (const lesson of section.lessons) {
      if (lesson.type === "VIDEO" && !lesson.videoAssetId && !lesson.videoUrl) {
        issues.push(`Lesson "${lesson.title}" is missing its video.`);
      }
    }
  }
  if (course.learningOutcomes.length === 0) {
    issues.push("Add at least one learning outcome.");
  }
  if (Number(course.price) < 0) {
    issues.push("Set a valid price.");
  }
  return issues.length === 0 ? { complete: true } : { complete: false, issues };
}

export async function getCompleteness(
  instructor: ApprovedInstructor,
  courseId: string,
): Promise<CourseCompletenessResult> {
  const course = await loadOwnedCourseOrThrow(courseId, instructor);
  return checkCompleteness(course);
}

export async function submitCourseForReview(
  instructor: ApprovedInstructor,
  courseId: string,
): Promise<void> {
  const course = await loadOwnedCourseOrThrow(courseId, instructor);

  if (!(SUBMITTABLE_STATUSES as readonly string[]).includes(course.status)) {
    throw new CourseStateError("Only a draft or rejected course can be submitted for review.");
  }

  const completeness = checkCompleteness(course);
  if (!completeness.complete) {
    throw new CourseStateError(
      `Please complete the following before submitting: ${completeness.issues.join(" ")}`,
    );
  }

  const result = await courseRepository.transitionStatus(courseId, ["DRAFT", "REJECTED"], {
    status: "PENDING_REVIEW",
    submittedAt: new Date(),
    rejectionReason: null,
  });

  if (result.count === 0) {
    // Someone else changed the status between our read and this write.
    throw new CourseStateError("This course's status just changed. Refresh and try again.");
  }
}
