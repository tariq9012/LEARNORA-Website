import { prisma } from "../db/client";

/** For ownership verification: lesson -> section -> course, in one query. */
export function findLessonWithOwnership(lessonId: string) {
  return prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { id: true, sectionId: true, section: { select: { courseId: true } } },
  });
}

/** Same, plus the lesson's current video asset — used by media-service.ts to safely replace it. */
export function findLessonForMedia(lessonId: string) {
  return prisma.lesson.findUnique({
    where: { id: lessonId },
    select: {
      id: true,
      sectionId: true,
      videoAssetId: true,
      type: true,
      section: { select: { courseId: true } },
    },
  });
}

export async function createLesson(
  sectionId: string,
  data: {
    title: string;
    description?: string | undefined;
    type: "VIDEO" | "ARTICLE" | "QUIZ";
    videoUrl?: string | undefined;
    content?: string | undefined;
    duration?: number | undefined;
    isPreview: boolean;
  },
) {
  const last = await prisma.lesson.findFirst({
    where: { sectionId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  return prisma.lesson.create({
    data: { sectionId, ...data, position: (last?.position ?? -1) + 1 },
  });
}

export function updateLesson(lessonId: string, data: Record<string, unknown>) {
  return prisma.lesson.update({ where: { id: lessonId }, data });
}

export function deleteLesson(lessonId: string) {
  return prisma.lesson.delete({ where: { id: lessonId } });
}

/** Same two-phase temp-position dance as reorderSections, scoped to one section. */
export function reorderLessons(sectionId: string, orderedIds: string[]) {
  return prisma.$transaction([
    ...orderedIds.map((id, index) =>
      prisma.lesson.updateMany({ where: { id, sectionId }, data: { position: -(index + 1) } }),
    ),
    ...orderedIds.map((id, index) =>
      prisma.lesson.updateMany({ where: { id, sectionId }, data: { position: index } }),
    ),
  ]);
}
