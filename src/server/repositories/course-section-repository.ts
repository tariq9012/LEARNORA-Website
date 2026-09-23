import { prisma } from "../db/client";

export function listSectionsForCourse(courseId: string) {
  return prisma.courseSection.findMany({
    where: { courseId },
    orderBy: { position: "asc" },
    include: { lessons: { orderBy: { position: "asc" } } },
  });
}

export function findSectionWithCourseId(sectionId: string) {
  return prisma.courseSection.findUnique({
    where: { id: sectionId },
    select: { id: true, courseId: true },
  });
}

export async function createSection(
  courseId: string,
  data: { title: string; description?: string | undefined },
) {
  const last = await prisma.courseSection.findFirst({
    where: { courseId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  return prisma.courseSection.create({
    data: {
      courseId,
      title: data.title,
      description: data.description,
      position: (last?.position ?? -1) + 1,
    },
  });
}

export function updateSection(
  sectionId: string,
  data: { title?: string | undefined; description?: string | undefined },
) {
  return prisma.courseSection.update({ where: { id: sectionId }, data });
}

export function deleteSection(sectionId: string) {
  // Lessons cascade-delete with the section (onDelete: Cascade in schema).
  return prisma.courseSection.delete({ where: { id: sectionId } });
}

/**
 * Reassigns positions 0..n-1 to `orderedIds`, in that order, for a single
 * course. Two-phase (temp negative positions, then final) so intermediate
 * writes never collide with the @@unique([courseId, position]) constraint
 * mid-transaction.
 */
export function reorderSections(courseId: string, orderedIds: string[]) {
  return prisma.$transaction([
    ...orderedIds.map((id, index) =>
      prisma.courseSection.updateMany({
        where: { id, courseId },
        data: { position: -(index + 1) },
      }),
    ),
    ...orderedIds.map((id, index) =>
      prisma.courseSection.updateMany({ where: { id, courseId }, data: { position: index } }),
    ),
  ]);
}
