import { prisma } from "../db/client";
import { entitledEnrollmentsCount } from "../services/enrollment-policy";

export function findWishlistItem(userId: string, courseId: string) {
  return prisma.wishlist.findUnique({ where: { userId_courseId: { userId, courseId } } });
}

/** Idempotent add — safe to call even if the item is already saved. */
export function addWishlistItem(userId: string, courseId: string) {
  return prisma.wishlist.upsert({
    where: { userId_courseId: { userId, courseId } },
    update: {},
    create: { userId, courseId },
  });
}

/** Idempotent remove — no error if the item was never saved. */
export function removeWishlistItem(userId: string, courseId: string) {
  return prisma.wishlist.deleteMany({ where: { userId, courseId } });
}

export function listWishlistForUser(userId: string) {
  return prisma.wishlist.findMany({
    where: { userId },
    include: {
      course: {
        include: {
          category: true,
          instructor: true,
          reviews: { where: { hiddenAt: null }, select: { rating: true } },
          _count: { select: { enrollments: entitledEnrollmentsCount(), reviews: true } },
          sections: { select: { lessons: { select: { duration: true } } } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}
