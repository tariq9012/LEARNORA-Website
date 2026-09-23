import * as assetRepository from "../repositories/asset-repository";
import * as courseRepository from "../repositories/instructor-course-repository";
import * as lessonRepository from "../repositories/lesson-repository";
import { getStorageProvider } from "../storage";
import { isEditable } from "../services/instructor-course-service";
import type { ApprovedInstructor } from "../auth/instructor-guard";
import type { MediaPurpose } from "./media-config";
import type { ReceivedUpload } from "./upload-handler";
import { lessonResourceUrl, lessonVideoUrl, publicAssetUrl } from "./media-urls";
import type { AssetDTO, LessonResourceDTO } from "../dto/media";

export class MediaOwnershipError extends Error {
  constructor() {
    super("Course not found.");
  }
}
export class MediaStateError extends Error {}

async function loadEditableOwnedCourse(instructor: ApprovedInstructor, courseId: string) {
  const course = await courseRepository.findOwnedCourse(courseId, instructor.id);
  if (!course) throw new MediaOwnershipError();
  if (!isEditable(course.status)) {
    throw new MediaStateError("This course can't be edited right now.");
  }
  return course;
}

async function loadOwnedLessonForMedia(
  instructor: ApprovedInstructor,
  courseId: string,
  lessonId: string,
) {
  await loadEditableOwnedCourse(instructor, courseId);
  const lesson = await lessonRepository.findLessonForMedia(lessonId);
  if (!lesson || lesson.section.courseId !== courseId) throw new MediaOwnershipError();
  return lesson;
}

function toAssetDTO(
  asset: { id: string; originalFilename: string; mimeType: string; sizeBytes: number },
  url: string,
): AssetDTO {
  return {
    assetId: asset.id,
    originalFilename: asset.originalFilename,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
    url,
  };
}

/** Deletes the old asset's DB row and file only after the new one is safely in place — never the other way around. */
async function replaceAsset(previousAssetId: string | null) {
  if (!previousAssetId) return;
  const previous = await assetRepository.findAssetById(previousAssetId);
  if (!previous) return;
  await assetRepository.deleteAsset(previous.id).catch(() => undefined);
  await getStorageProvider()
    .delete(previous.storageKey)
    .catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Course thumbnail
// ---------------------------------------------------------------------------

export async function attachCourseThumbnail(
  instructor: ApprovedInstructor,
  courseId: string,
  uploaded: ReceivedUpload,
): Promise<AssetDTO> {
  const course = await loadEditableOwnedCourse(instructor, courseId);
  const asset = await assetRepository.createAsset({
    ownerId: instructor.id,
    storageKey: uploaded.storageKey,
    originalFilename: uploaded.originalFilename,
    mimeType: uploaded.mimeType,
    sizeBytes: uploaded.sizeBytes,
    purpose: "COURSE_THUMBNAIL",
  });
  await courseRepository.updateCourseMetadata(courseId, { thumbnailAssetId: asset.id });
  await replaceAsset(course.thumbnailAssetId);
  return toAssetDTO(asset, publicAssetUrl(asset.id));
}

export async function removeCourseThumbnail(instructor: ApprovedInstructor, courseId: string) {
  const course = await loadEditableOwnedCourse(instructor, courseId);
  if (!course.thumbnailAssetId) return;
  await courseRepository.updateCourseMetadata(courseId, { thumbnailAssetId: null });
  await replaceAsset(course.thumbnailAssetId);
}

// ---------------------------------------------------------------------------
// Course preview video
// ---------------------------------------------------------------------------

export async function attachCoursePreview(
  instructor: ApprovedInstructor,
  courseId: string,
  uploaded: ReceivedUpload,
): Promise<AssetDTO> {
  const course = await loadEditableOwnedCourse(instructor, courseId);
  const asset = await assetRepository.createAsset({
    ownerId: instructor.id,
    storageKey: uploaded.storageKey,
    originalFilename: uploaded.originalFilename,
    mimeType: uploaded.mimeType,
    sizeBytes: uploaded.sizeBytes,
    purpose: "COURSE_PREVIEW",
  });
  await courseRepository.updateCourseMetadata(courseId, { previewAssetId: asset.id });
  await replaceAsset(course.previewAssetId);
  return toAssetDTO(asset, publicAssetUrl(asset.id));
}

export async function removeCoursePreview(instructor: ApprovedInstructor, courseId: string) {
  const course = await loadEditableOwnedCourse(instructor, courseId);
  if (!course.previewAssetId) return;
  await courseRepository.updateCourseMetadata(courseId, { previewAssetId: null });
  await replaceAsset(course.previewAssetId);
}

// ---------------------------------------------------------------------------
// Lesson video
// ---------------------------------------------------------------------------

export async function attachLessonVideo(
  instructor: ApprovedInstructor,
  courseId: string,
  lessonId: string,
  uploaded: ReceivedUpload,
): Promise<AssetDTO> {
  const lesson = await loadOwnedLessonForMedia(instructor, courseId, lessonId);
  const asset = await assetRepository.createAsset({
    ownerId: instructor.id,
    storageKey: uploaded.storageKey,
    originalFilename: uploaded.originalFilename,
    mimeType: uploaded.mimeType,
    sizeBytes: uploaded.sizeBytes,
    purpose: "LESSON_VIDEO",
  });
  await lessonRepository.updateLesson(lessonId, { videoAssetId: asset.id });
  await replaceAsset(lesson.videoAssetId);
  return toAssetDTO(asset, lessonVideoUrl(asset.id));
}

export async function removeLessonVideo(
  instructor: ApprovedInstructor,
  courseId: string,
  lessonId: string,
) {
  const lesson = await loadOwnedLessonForMedia(instructor, courseId, lessonId);
  if (!lesson.videoAssetId) return;
  await lessonRepository.updateLesson(lessonId, { videoAssetId: null });
  await replaceAsset(lesson.videoAssetId);
}

// ---------------------------------------------------------------------------
// Lesson resources (multiple per lesson)
// ---------------------------------------------------------------------------

export async function attachLessonResource(
  instructor: ApprovedInstructor,
  courseId: string,
  lessonId: string,
  uploaded: ReceivedUpload,
  title: string,
): Promise<LessonResourceDTO> {
  await loadOwnedLessonForMedia(instructor, courseId, lessonId);
  const asset = await assetRepository.createAsset({
    ownerId: instructor.id,
    storageKey: uploaded.storageKey,
    originalFilename: uploaded.originalFilename,
    mimeType: uploaded.mimeType,
    sizeBytes: uploaded.sizeBytes,
    purpose: "LESSON_RESOURCE",
  });
  const resource = await assetRepository.createLessonResource({
    lessonId,
    assetId: asset.id,
    title: title.trim() || uploaded.originalFilename,
  });
  return {
    id: resource.id,
    title: resource.title,
    originalFilename: asset.originalFilename,
    sizeBytes: asset.sizeBytes,
    downloadUrl: lessonResourceUrl(asset.id),
  };
}

export async function removeLessonResource(
  instructor: ApprovedInstructor,
  courseId: string,
  lessonId: string,
  resourceId: string,
) {
  await loadOwnedLessonForMedia(instructor, courseId, lessonId);
  const resource = await assetRepository.findLessonResource(resourceId);
  if (!resource || resource.lesson.id !== lessonId) throw new MediaOwnershipError();

  await assetRepository.deleteLessonResource(resourceId);
  await assetRepository.deleteAsset(resource.assetId).catch(() => undefined);
  await getStorageProvider()
    .delete(resource.asset.storageKey)
    .catch(() => undefined);
}

export async function listLessonResourcesForBuilder(
  instructor: ApprovedInstructor,
  courseId: string,
  lessonId: string,
): Promise<LessonResourceDTO[]> {
  await loadOwnedLessonForMedia(instructor, courseId, lessonId);
  const rows = await assetRepository.listLessonResources(lessonId);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    originalFilename: r.asset.originalFilename,
    sizeBytes: r.asset.sizeBytes,
    downloadUrl: lessonResourceUrl(r.assetId),
  }));
}

/** Purpose → max-size lookup used by route handlers before they start streaming a body. */
export function purposeForKind(kind: "thumbnail" | "preview" | "lesson-video" | "lesson-resource"): MediaPurpose {
  switch (kind) {
    case "thumbnail":
      return "COURSE_THUMBNAIL";
    case "preview":
      return "COURSE_PREVIEW";
    case "lesson-video":
      return "LESSON_VIDEO";
    case "lesson-resource":
      return "LESSON_RESOURCE";
  }
}
