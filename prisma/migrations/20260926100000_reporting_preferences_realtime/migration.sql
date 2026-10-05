/*
  Phase 12 — reporting/moderation, notification preferences, message
  tombstones and review moderation. Additive; the reports table is dropped
  and recreated changing `reason` from free-text to an enum, which is safe
  because no report rows exist yet (Report was defined in an earlier phase
  but nothing writes to it before Phase 12).
*/

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('SPAM', 'HARASSMENT', 'INAPPROPRIATE', 'MISLEADING', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportAction" AS ENUM ('REVIEW_HIDDEN', 'REVIEW_RESTORED', 'MESSAGE_REMOVED');

-- AlterTable: reason free-text -> enum (table is empty pre-Phase-12; USING cast documents the (unused) migration path anyway)
ALTER TABLE "reports" ALTER COLUMN "reason" TYPE "ReportReason" USING ("reason"::"ReportReason");

-- AlterTable
ALTER TABLE "reports" ADD COLUMN     "contentSnapshot" JSONB,
ADD COLUMN     "action" "ReportAction",
ADD COLUMN     "adminNote" TEXT;

-- AlterTable
ALTER TABLE "reviews" ADD COLUMN     "hiddenAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "removedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseUpdates" BOOLEAN NOT NULL DEFAULT true,
    "payments" BOOLEAN NOT NULL DEFAULT true,
    "refunds" BOOLEAN NOT NULL DEFAULT true,
    "payouts" BOOLEAN NOT NULL DEFAULT true,
    "messages" BOOLEAN NOT NULL DEFAULT true,
    "certificates" BOOLEAN NOT NULL DEFAULT true,
    "moderation" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_userId_key" ON "notification_preferences"("userId");

-- CreateIndex
CREATE INDEX "reviews_courseId_hiddenAt_idx" ON "reviews"("courseId", "hiddenAt");

-- DropIndex (superseded by the composite below)
DROP INDEX "reports_status_idx";

-- CreateIndex
CREATE INDEX "reports_status_createdAt_idx" ON "reports"("status", "createdAt");

-- CreateIndex
CREATE INDEX "reports_targetType_status_idx" ON "reports"("targetType", "status");

-- CreateIndex
CREATE INDEX "reports_reporterId_idx" ON "reports"("reporterId");

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Duplicate-active-report guard: a reporter may have at most ONE OPEN/IN_REVIEW
-- report against the same target. Once RESOLVED/DISMISSED they may report
-- again (a genuinely new incident). Partial unique index — not expressible in
-- Prisma's schema language.
CREATE UNIQUE INDEX "reports_active_reporter_target_key"
  ON "reports"("reporterId", "targetType", "targetId")
  WHERE "status" IN ('OPEN', 'IN_REVIEW');
