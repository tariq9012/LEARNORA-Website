/*
  Warnings:

  - Added the required column `courseTitle` to the `certificates` table without a default value. This is not possible if the table is not empty.
  - Added the required column `learnerName` to the `certificates` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "certificates" ADD COLUMN     "courseTitle" TEXT NOT NULL,
ADD COLUMN     "learnerName" TEXT NOT NULL;
