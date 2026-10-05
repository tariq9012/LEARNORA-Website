import { prisma } from "../db/client";

/** Phase 15: public marketing aggregates — counts only, no user data. */
export function countActiveStudents() {
  return prisma.user.count({ where: { role: "STUDENT", status: "ACTIVE" } });
}
export function countPublishedCourses() {
  return prisma.course.count({ where: { status: "PUBLISHED" } });
}
export function countApprovedInstructors() {
  return prisma.user.count({
    where: {
      role: "INSTRUCTOR",
      status: "ACTIVE",
      instructorProfile: { is: { approvalStatus: "APPROVED" } },
    },
  });
}
export function countCompletedLessons() {
  return prisma.lessonProgress.count({ where: { completed: true } });
}

/** Approved, active instructors who actually have a published course (their public profile page has something to show). */
export function listPublicFaculty(take: number) {
  return prisma.user.findMany({
    where: {
      role: "INSTRUCTOR",
      status: "ACTIVE",
      instructorProfile: { is: { approvalStatus: "APPROVED" } },
      coursesInstructed: { some: { status: "PUBLISHED" } },
    },
    select: {
      id: true,
      name: true,
      avatar: true,
      avatarAssetId: true,
      instructorProfile: { select: { headline: true } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take,
  });
}
