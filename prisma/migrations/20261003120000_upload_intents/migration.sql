-- Phase 18: direct-to-R2 uploads. ADDITIVE ONLY: one new table, no existing
-- table, column, enum or row is touched. Existing LOCAL and S3 assets keep
-- their storage keys and remain readable.

-- CreateTable
CREATE TABLE "upload_intents" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" "AssetPurpose" NOT NULL,
    "courseId" TEXT,
    "lessonId" TEXT,
    "storageKey" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "expectedSize" INTEGER NOT NULL,
    "resourceTitle" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "finalizedAt" TIMESTAMP(3),
    "assetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upload_intents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "upload_intents_storageKey_key" ON "upload_intents"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "upload_intents_assetId_key" ON "upload_intents"("assetId");

-- CreateIndex
CREATE INDEX "upload_intents_userId_idx" ON "upload_intents"("userId");

-- CreateIndex
CREATE INDEX "upload_intents_finalizedAt_expiresAt_idx" ON "upload_intents"("finalizedAt", "expiresAt");
