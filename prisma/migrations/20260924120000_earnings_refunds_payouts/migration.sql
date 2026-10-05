/*
  Phase 10 — instructor earnings lifecycle, refunds, payouts.

  Additive and safe to run against a database that already contains Phase 9
  data (orders, payments, instructor earnings):

  - Every existing instructor_earnings row becomes AVAILABLE (the Phase 10
    policy: a paid purchase is withdrawable immediately). Their gross /
    commission / net amounts are NOT touched, so historical earnings keep
    the split they were created with.
  - refunds/payouts hold no rows today (no earlier phase wrote to them). The
    refunds.reference backfill below only exists so the NOT NULL step can
    never fail on an unexpected row.

  The CHECK constraints at the bottom are hand-written (Prisma's schema
  language cannot express them) and act as a database-level safety net for
  the earning/payout state machine; Prisma ignores them when diffing.
*/

-- AlterEnum
-- (Not referenced anywhere else in this migration: Postgres does not allow a
-- newly added enum value to be used in the same transaction that added it.)
ALTER TYPE "PayoutStatus" ADD VALUE 'REJECTED';

-- CreateEnum
CREATE TYPE "EarningStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'PAID', 'REVERSED');

-- DropIndex
DROP INDEX "refunds_paymentId_idx";

-- AlterTable
ALTER TABLE "instructor_earnings" ADD COLUMN     "refundId" TEXT,
ADD COLUMN     "status" "EarningStatus" NOT NULL DEFAULT 'AVAILABLE';

-- AlterTable
ALTER TABLE "payouts" ADD COLUMN     "processedById" TEXT,
ADD COLUMN     "rejectionReason" TEXT;

-- AlterTable
ALTER TABLE "refunds" ADD COLUMN     "externalReference" TEXT,
ADD COLUMN     "reference" TEXT;

-- Backfill (no-op on an empty table) so the column can become NOT NULL.
UPDATE "refunds" SET "reference" = 'LRN-REF-' || upper(substr(md5("id"), 1, 10)) WHERE "reference" IS NULL;

ALTER TABLE "refunds" ALTER COLUMN "reference" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "instructor_earnings_refundId_key" ON "instructor_earnings"("refundId");

-- CreateIndex
CREATE INDEX "instructor_earnings_instructorId_status_idx" ON "instructor_earnings"("instructorId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payouts_reference_key" ON "payouts"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_paymentId_key" ON "refunds"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_reference_key" ON "refunds"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_externalReference_key" ON "refunds"("externalReference");

-- AddForeignKey
ALTER TABLE "instructor_earnings" ADD CONSTRAINT "instructor_earnings_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "refunds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Database-level invariants (hand-written; not modelled by Prisma).

-- An earning is linked to a payout exactly while it is RESERVED or PAID.
ALTER TABLE "instructor_earnings" ADD CONSTRAINT "instructor_earnings_payout_link_check"
  CHECK (("status" IN ('RESERVED', 'PAID')) = ("payoutId" IS NOT NULL));

-- An earning is linked to a refund exactly when it is REVERSED.
ALTER TABLE "instructor_earnings" ADD CONSTRAINT "instructor_earnings_refund_link_check"
  CHECK (("status" = 'REVERSED') = ("refundId" IS NOT NULL));

-- The instructor's share can never be negative or exceed the sale.
ALTER TABLE "instructor_earnings" ADD CONSTRAINT "instructor_earnings_amounts_check"
  CHECK ("netAmount" >= 0 AND "netAmount" <= "grossAmount");

-- A payout is always for a positive amount.
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_amount_positive_check"
  CHECK ("amount" > 0);
