import * as assetRepository from "../repositories/asset-repository";
import * as enrollmentRepository from "../repositories/enrollment-repository";
import { isEnrollmentEntitled } from "../services/enrollment-policy";
import type { SafeUser } from "../auth/types";

export type AssetAccessResult = { allowed: true } | { allowed: false; reason: string };

const PUBLIC_COURSE_STATUSES = new Set(["PUBLISHED"]);

/**
 * The single source of truth for "can this user see this asset". Every
 * media-serving route (public thumbnail, private lesson video, resource
 * download) calls this instead of re-deriving its own rules, so a rule
 * only ever needs to change here.
 *
 * Decision inputs: asset purpose, the course's moderation status, the
 * lesson's preview flag, the user's enrollment, instructor ownership, and
 * admin role. Never trusts anything from the request other than the
 * authenticated user and the assetId.
 */
export async function canViewAsset(
  user: SafeUser | null,
  assetId: string,
): Promise<AssetAccessResult> {
  const asset = await assetRepository.findAssetForAccessCheck(assetId);
  if (!asset) return { allowed: false, reason: "Not found." };

  if (user?.role === "ADMIN") return { allowed: true };

  switch (asset.purpose) {
    case "COURSE_THUMBNAIL":
    case "COURSE_PREVIEW": {
      const course = asset.courseThumbnailOf ?? asset.coursePreviewOf;
      if (!course) return { allowed: false, reason: "Not found." };
      if (PUBLIC_COURSE_STATUSES.has(course.status)) return { allowed: true };
      if (user && user.id === course.instructorId) return { allowed: true };
      return { allowed: false, reason: "This media isn't public yet." };
    }

    case "LESSON_VIDEO": {
      const lesson = asset.lessonVideoOf;
      if (!lesson) return { allowed: false, reason: "Not found." };
      const course = lesson.section.course;

      if (user && user.id === course.instructorId) return { allowed: true };

      // Free preview lessons are public only once the course itself is
      // published — never for draft/pending/rejected courses, no matter
      // how the lesson is flagged.
      if (lesson.isPreview && course.status === "PUBLISHED") return { allowed: true };

      if (!user) return { allowed: false, reason: "Please log in to view this video." };

      const enrollment = await enrollmentRepository.findEnrollment(
        user.id,
        lesson.section.courseId,
      );
      if (enrollment && isEnrollmentEntitled(enrollment.status)) return { allowed: true };

      return { allowed: false, reason: "Enroll in this course to view this lesson." };
    }

    case "LESSON_RESOURCE": {
      const link = asset.lessonResources[0];
      if (!link) return { allowed: false, reason: "Not found." };
      const lesson = link.lesson;
      const course = lesson.section.course;

      if (user && user.id === course.instructorId) return { allowed: true };
      if (lesson.isPreview && course.status === "PUBLISHED") return { allowed: true };

      if (!user) return { allowed: false, reason: "Please log in to download this file." };

      const enrollment = await enrollmentRepository.findEnrollment(
        user.id,
        lesson.section.courseId,
      );
      if (enrollment && isEnrollmentEntitled(enrollment.status)) return { allowed: true };

      return { allowed: false, reason: "Enroll in this course to download this file." };
    }

    case "AVATAR":
      // A profile avatar is meant to be seen wherever the profile itself
      // is shown (public instructor pages, reviews, etc.) — same
      // reasoning as a published course thumbnail. Never used for
      // anything private, so no owner/enrollment check applies.
      return { allowed: true };

    default:
      // Exhaustiveness guard — every AssetPurpose is handled above.
      return { allowed: false, reason: "Not found." };
  }
}
