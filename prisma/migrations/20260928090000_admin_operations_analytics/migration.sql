/*
  Phase 14 — admin operations + instructor analytics/students/reviews.

  - instructor_profiles gets reviewedAt/reviewedById, mirroring the exact
    columns Course already has for the same purpose (who decided, when) —
    not a new pattern, just extending an existing one to instructor
    approval, which previously only recorded approvedAt (when approved,
    but not who, and nothing at all for a rejection).
  - Index changes only add or replace indexes to match Phase 14's actual
    query patterns (admin/instructor list filters); no column is dropped,
    no row is touched.
*/

-- AlterTable
ALTER TABLE "instructor_profiles" ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT;

-- AddForeignKey
ALTER TABLE "instructor_profiles" ADD CONSTRAINT "instructor_profiles_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Enrollment: replace the old single-column courseId index with a
-- (courseId, status) compound — it still serves plain courseId lookups
-- via the leftmost prefix, so nothing regresses, and it now also serves
-- the new admin-enrollments/instructor-students status filters.
-- DropIndex
DROP INDEX "enrollments_courseId_idx";

-- CreateIndex
CREATE INDEX "enrollments_courseId_status_idx" ON "enrollments"("courseId", "status");

-- CreateIndex
CREATE INDEX "enrollments_userId_status_idx" ON "enrollments"("userId", "status");

-- CreateIndex
CREATE INDEX "courses_instructorId_status_idx" ON "courses"("instructorId", "status");

-- CreateIndex
CREATE INDEX "payments_status_createdAt_idx" ON "payments"("status", "createdAt");
