import { prisma } from "../db/client";

export function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } });
}

export function findUserById(id: string) {
  return prisma.user.findUnique({ where: { id } });
}

export function createStudent(data: { name: string; email: string; passwordHash: string }) {
  return prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      passwordHash: data.passwordHash,
      role: "STUDENT",
      status: "ACTIVE",
      studentProfile: { create: {} },
    },
  });
}

export function createInstructor(data: { name: string; email: string; passwordHash: string }) {
  return prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      passwordHash: data.passwordHash,
      role: "INSTRUCTOR",
      status: "ACTIVE",
      // approvalStatus defaults to PENDING — an instructor can sign in and
      // see their dashboard, but publishing actions must check this
      // server-side (enforced in the course-service moderation checks).
      instructorProfile: { create: {} },
    },
  });
}

export function updatePasswordHash(userId: string, passwordHash: string) {
  return prisma.user.update({ where: { id: userId }, data: { passwordHash } });
}

export function updateUserName(userId: string, name: string) {
  return prisma.user.update({ where: { id: userId }, data: { name } });
}

/** Points the user at a new avatar Asset, or clears it (pass null). Never touches the legacy `avatar` URL column. */
export function updateAvatarAsset(userId: string, avatarAssetId: string | null) {
  return prisma.user.update({ where: { id: userId }, data: { avatarAssetId } });
}
