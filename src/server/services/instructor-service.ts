import { averageRating, initialsOf } from "@/lib/format";

import * as instructorRepository from "../repositories/instructor-repository";
import { publicAssetUrl } from "../media/media-urls";
import { mapCourseToCardDTO } from "./course-mapper";
import type { InstructorSummaryDTO } from "../dto/instructor";
import type { CourseCardDTO } from "../dto/course";

/** Real uploaded avatar (Phase 13) if set, else the legacy avatar URL column, else null. */
function avatarUrlOf(user: { avatarAssetId: string | null; avatar: string | null }): string | null {
  return user.avatarAssetId ? publicAssetUrl(user.avatarAssetId) : user.avatar;
}

/** Website first (if set), then every entry of the socialLinks JSON object, each already validated as a URL at write time. */
function socialLinksOf(profile: {
  website: string | null;
  socialLinks: unknown;
}): { label: string; href: string }[] {
  const links: { label: string; href: string }[] = [];
  if (profile.website) links.push({ label: "Website", href: profile.website });

  const raw =
    profile.socialLinks &&
    typeof profile.socialLinks === "object" &&
    !Array.isArray(profile.socialLinks)
      ? (profile.socialLinks as Record<string, unknown>)
      : {};
  for (const [label, href] of Object.entries(raw)) {
    if (typeof href === "string" && href.length > 0) links.push({ label, href });
  }
  return links;
}

export async function getInstructorProfile(
  instructorId: string,
): Promise<{ instructor: InstructorSummaryDTO; courses: CourseCardDTO[] } | null> {
  const user = await instructorRepository.findApprovedInstructorById(instructorId);
  if (!user || !user.instructorProfile) return null;

  const courseRows = await instructorRepository.findPublishedCoursesByInstructor(instructorId);
  const courses = courseRows.map(mapCourseToCardDTO);

  const [studentCount, ratings] = await Promise.all([
    instructorRepository.countEnrolledStudentsForInstructor(instructorId),
    instructorRepository.findReviewRatingsForInstructor(instructorId),
  ]);

  const instructor: InstructorSummaryDTO = {
    id: user.id,
    name: user.name,
    initials: initialsOf(user.name),
    title: user.instructorProfile.headline ?? "Instructor",
    expertise: user.instructorProfile.expertise,
    rating: averageRating(ratings.map((r) => r.rating)),
    students: studentCount,
    courses: user._count.coursesInstructed,
    reviews: ratings.length,
    bio: user.instructorProfile.bio ?? "",
    avatarUrl: avatarUrlOf(user),
    social: socialLinksOf(user.instructorProfile),
  };

  return { instructor, courses };
}
