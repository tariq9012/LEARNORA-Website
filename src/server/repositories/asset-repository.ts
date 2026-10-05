import { prisma } from "../db/client";
import type { MediaPurpose } from "../media/media-config";
import { getStorageProvider } from "../storage";

export function createAsset(data: {
  ownerId: string;
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  purpose: MediaPurpose;
}) {
  return prisma.asset.create({
    data: {
      ...data, // Records where THIS file lives (the provider that just saved it).
      storageProvider: getStorageProvider().kind,
    },
  });
}

export function findAssetById(assetId: string) {
  return prisma.asset.findUnique({ where: { id: assetId } });
}

export function deleteAsset(assetId: string) {
  return prisma.asset.delete({ where: { id: assetId } });
}

/** Asset together with everything needed to decide access (media-access-service.ts). */
export function findAssetForAccessCheck(assetId: string) {
  return prisma.asset.findUnique({
    where: { id: assetId },
    include: {
      courseThumbnailOf: { select: { id: true, status: true, instructorId: true } },
      coursePreviewOf: { select: { id: true, status: true, instructorId: true } },
      lessonVideoOf: {
        select: {
          id: true,
          isPreview: true,
          section: {
            select: {
              courseId: true,
              course: { select: { status: true, instructorId: true } },
            },
          },
        },
      },
      lessonResources: {
        select: {
          lesson: {
            select: {
              id: true,
              isPreview: true,
              section: {
                select: {
                  courseId: true,
                  course: { select: { status: true, instructorId: true } },
                },
              },
            },
          },
        },
      },
    },
  });
}

export function createLessonResource(data: { lessonId: string; assetId: string; title: string }) {
  return prisma.$transaction(async (tx) => {
    const last = await tx.lessonResource.findFirst({
      where: { lessonId: data.lessonId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    return tx.lessonResource.create({
      data: { ...data, position: (last?.position ?? -1) + 1 },
    });
  });
}

export function findLessonResource(resourceId: string) {
  return prisma.lessonResource.findUnique({
    where: { id: resourceId },
    include: {
      asset: true,
      lesson: { select: { id: true, section: { select: { courseId: true } } } },
    },
  });
}

export function deleteLessonResource(resourceId: string) {
  return prisma.lessonResource.delete({ where: { id: resourceId } });
}

export function listLessonResources(lessonId: string) {
  return prisma.lessonResource.findMany({
    where: { lessonId },
    include: { asset: true },
    orderBy: { position: "asc" },
  });
}
