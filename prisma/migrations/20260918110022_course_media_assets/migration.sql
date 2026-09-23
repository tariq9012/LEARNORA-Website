/*
  Warnings:

  - A unique constraint covering the columns `[thumbnailAssetId]` on the table `courses` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[previewAssetId]` on the table `courses` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[videoAssetId]` on the table `lessons` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "AssetPurpose" AS ENUM ('COURSE_THUMBNAIL', 'COURSE_PREVIEW', 'LESSON_VIDEO', 'LESSON_RESOURCE');

-- CreateEnum
CREATE TYPE "StorageProviderKind" AS ENUM ('LOCAL');

-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "previewAssetId" TEXT,
ADD COLUMN     "thumbnailAssetId" TEXT;

-- AlterTable
ALTER TABLE "lessons" ADD COLUMN     "videoAssetId" TEXT;

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "storageProvider" "StorageProviderKind" NOT NULL DEFAULT 'LOCAL',
    "storageKey" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "purpose" "AssetPurpose" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_resources" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lesson_resources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assets_storageKey_key" ON "assets"("storageKey");

-- CreateIndex
CREATE INDEX "assets_ownerId_idx" ON "assets"("ownerId");

-- CreateIndex
CREATE INDEX "assets_purpose_idx" ON "assets"("purpose");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_resources_assetId_key" ON "lesson_resources"("assetId");

-- CreateIndex
CREATE INDEX "lesson_resources_lessonId_idx" ON "lesson_resources"("lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "courses_thumbnailAssetId_key" ON "courses"("thumbnailAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "courses_previewAssetId_key" ON "courses"("previewAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "lessons_videoAssetId_key" ON "lessons"("videoAssetId");

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_resources" ADD CONSTRAINT "lesson_resources_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_resources" ADD CONSTRAINT "lesson_resources_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_thumbnailAssetId_fkey" FOREIGN KEY ("thumbnailAssetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_previewAssetId_fkey" FOREIGN KEY ("previewAssetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_videoAssetId_fkey" FOREIGN KEY ("videoAssetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
