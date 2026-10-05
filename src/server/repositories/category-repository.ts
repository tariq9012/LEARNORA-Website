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

// ---------------------------------------------------------------------------
// Phase 14 — admin management (includes INACTIVE categories)
// ---------------------------------------------------------------------------

type AdminCategoryFilters = { search?: string; status?: "ACTIVE" | "INACTIVE" };

function buildAdminCategoryWhere(filters: AdminCategoryFilters) {
  return {
    ...(filters.status && { status: filters.status }),
    ...(filters.search && {
      OR: [
        { name: { contains: filters.search, mode: "insensitive" as const } },
        { slug: { contains: filters.search, mode: "insensitive" as const } },
      ],
    }),
  };
}

export function listCategoriesForAdmin(filters: AdminCategoryFilters, skip: number, take: number) {
  return prisma.category.findMany({
    where: buildAdminCategoryWhere(filters),
    // Total courses in ANY status — an admin needs to see everything that
    // still references the category before deactivating it.
    include: { _count: { select: { courses: true } } },
    orderBy: { name: "asc" },
    skip,
    take,
  });
}

export function countCategoriesForAdmin(filters: AdminCategoryFilters) {
  return prisma.category.count({ where: buildAdminCategoryWhere(filters) });
}

/** Every category (id + name only) for admin filter dropdowns — small, bounded by the size of the category list itself. */
export function listCategoryOptions() {
  return prisma.category.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 200,
  });
}

export function findCategoryById(id: string) {
  return prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { courses: true } } },
  });
}

export function findCategoryBySlug(slug: string) {
  return prisma.category.findUnique({ where: { slug } });
}

export function findCategoryByNameInsensitive(name: string) {
  return prisma.category.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
}

export function createCategory(data: { name: string; slug: string; description: string | null }) {
  return prisma.category.create({
    data,
    include: { _count: { select: { courses: true } } },
  });
}

export function updateCategory(
  id: string,
  data: {
    name?: string;
    slug?: string;
    description?: string | null;
    status?: "ACTIVE" | "INACTIVE";
  },
) {
  return prisma.category.update({
    where: { id },
    data,
    include: { _count: { select: { courses: true } } },
  });
}
