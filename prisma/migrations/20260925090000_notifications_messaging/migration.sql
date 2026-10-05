/*
  Phase 11 — real notifications + student/instructor messaging.

  Additive and safe against existing data: every new column is nullable, new
  indexes are non-unique or unique over columns that are NULL for all
  existing rows (Postgres treats NULLs as distinct in unique indexes), and
  nothing is dropped or rewritten.
*/

-- AlterEnum
-- (Not referenced elsewhere in this migration: Postgres does not allow a
-- newly added enum value to be used in the transaction that added it.)
ALTER TYPE "NotificationType" ADD VALUE 'PAYMENT';
ALTER TYPE "NotificationType" ADD VALUE 'REFUND';
ALTER TYPE "NotificationType" ADD VALUE 'COURSE_COMPLETED';
ALTER TYPE "NotificationType" ADD VALUE 'CERTIFICATE_READY';

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "courseId" TEXT,
ADD COLUMN     "lastMessageAt" TIMESTAMP(3),
ADD COLUMN     "studentId" TEXT;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "clientMessageId" TEXT;

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "eventKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "conversations_courseId_studentId_key" ON "conversations"("courseId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "messages_senderId_clientMessageId_key" ON "messages"("senderId", "clientMessageId");

-- CreateIndex
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_userId_eventKey_key" ON "notifications"("userId", "eventKey");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
