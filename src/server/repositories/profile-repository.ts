import { prisma } from "../db/client";
import type { Prisma } from "../../generated/prisma/client";

/** The full account record needed to render Settings/Profile — one round trip. */
export function findAccountByUserId(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    include: { studentProfile: true, instructorProfile: true },
  });
}

/**
 * StudentProfile is created alongside the User at registration (see
 * user-repository.createStudent), so `update` — not `upsert` — is correct
 * here; a missing row would mean the account is corrupt, not that it
 * needs lazily creating.
 */
export function updateStudentProfile(userId: string, data: Prisma.StudentProfileUpdateInput) {
  return prisma.studentProfile.update({ where: { userId }, data });
}

/** Same reasoning as updateStudentProfile — InstructorProfile always exists for an INSTRUCTOR account. */
export function updateInstructorProfile(userId: string, data: Prisma.InstructorProfileUpdateInput) {
  return prisma.instructorProfile.update({ where: { userId }, data });
}
