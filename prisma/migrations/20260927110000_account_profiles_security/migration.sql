/*
  Phase 13 — real profiles, account settings, security, billing/purchase
  account data. Additive only:

  - AssetPurpose gets a new AVATAR value (existing rows are unaffected —
    ADD VALUE never touches existing data).
  - users gets a nullable avatarAssetId pointing at an Asset, same
    optional-FK pattern already used by Course.thumbnailAssetId /
    previewAssetId. The pre-existing `avatar` text column is left in
    place as the legacy fallback (see the schema comment on User.avatar).
  - student_profiles gets nullable `website` and `location` columns,
    mirroring fields instructor_profiles already had.

  No data is deleted, no column is dropped, no existing row changes.
*/

-- AlterEnum
ALTER TYPE "AssetPurpose" ADD VALUE 'AVATAR';

-- AlterTable
ALTER TABLE "student_profiles" ADD COLUMN     "website" TEXT,
ADD COLUMN     "location" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "avatarAssetId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_avatarAssetId_key" ON "users"("avatarAssetId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_avatarAssetId_fkey" FOREIGN KEY ("avatarAssetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
