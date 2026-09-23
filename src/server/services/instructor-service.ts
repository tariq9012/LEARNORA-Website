import { averageRating, initialsOf } from "@/lib/format";

import * as instructorRepository from "../repositories/instructor-repository";
import { mapCourseToCardDTO } from "./course-mapper";
import type { InstructorSummaryDTO } from "../dto/instructor";
import type { CourseCardDTO } from "../dto/course";

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
    social: [],
  };

  return { instructor, courses };
}
