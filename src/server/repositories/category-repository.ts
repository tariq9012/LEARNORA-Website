import { prisma } from "../db/client";

/** Active categories with a live count of their PUBLISHED courses only. */
export function findActiveCategories() {
  return prisma.category.findMany({
    where: { status: "ACTIVE" },
    include: { _count: { select: { courses: { where: { status: "PUBLISHED" } } } } },
    orderBy: { name: "asc" },
  });
}

export function findActiveCategoryBySlug(slug: string) {
  return prisma.category.findFirst({
    where: { slug, status: "ACTIVE" },
    include: { _count: { select: { courses: { where: { status: "PUBLISHED" } } } } },
  });
}
