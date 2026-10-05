import { ForbiddenError } from "../auth/guards";
import * as categoryRepository from "../repositories/category-repository";
import { Prisma } from "../../generated/prisma/client";
import { slugify, withUniqueSuffix } from "../utils/slug";
import { resolvePagination } from "../validation/pagination";
import {
  createCategorySchema,
  listAdminCategoriesSchema,
  updateCategorySchema,
} from "../validation/admin";
import type { SafeUser } from "../auth/types";
import type { AdminCategoryDTO } from "../dto/admin";

export class CategoryAdminError extends Error {}

function assertAdmin(user: SafeUser) {
  if (user.role !== "ADMIN") throw new ForbiddenError("Only admins can do that.");
}

function toDTO(c: {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: "ACTIVE" | "INACTIVE";
  _count: { courses: number };
}): AdminCategoryDTO {
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description ?? "",
    status: c.status,
    courseCount: c._count.courses,
  };
}

/**
 * Category deletion policy (Phase 14, items 21/23): categories are NEVER
 * deleted — there is no delete function at all, so a category referenced
 * by courses can't be orphaned. Instead an admin sets status INACTIVE,
 * which removes it from the public category list/pages (see
 * findActiveCategories/findActiveCategoryBySlug) while every course in it
 * stays published and reachable by its own URL, still showing its
 * category name. Reactivating restores it.
 */

/** Slug is generated once at creation and never changes on rename, so existing /category/<slug> URLs keep working. Collisions get a suffix. */
async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name) || "category";
  if (!(await categoryRepository.findCategoryBySlug(base))) return base;
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = withUniqueSuffix(base);
    if (!(await categoryRepository.findCategoryBySlug(candidate))) return candidate;
  }
  throw new CategoryAdminError("Couldn't generate a unique slug — try a different name.");
}

export async function listAdminCategories(admin: SafeUser, input: unknown) {
  assertAdmin(admin);
  const filters = listAdminCategoriesSchema.parse(input ?? {});
  const { page, pageSize, skip, take } = resolvePagination(filters);
  const where = {
    ...(filters.status && { status: filters.status }),
    ...(filters.search && { search: filters.search }),
  };
  const [rows, total] = await Promise.all([
    categoryRepository.listCategoriesForAdmin(where, skip, take),
    categoryRepository.countCategoriesForAdmin(where),
  ]);
  return { categories: rows.map(toDTO), total, page, pageSize };
}

export async function listCategoryOptions(admin: SafeUser) {
  assertAdmin(admin);
  return categoryRepository.listCategoryOptions();
}

export async function createAdminCategory(
  admin: SafeUser,
  input: unknown,
): Promise<AdminCategoryDTO> {
  assertAdmin(admin);
  const data = createCategorySchema.parse(input);

  if (await categoryRepository.findCategoryByNameInsensitive(data.name)) {
    throw new CategoryAdminError("A category with that name already exists.");
  }

  try {
    const created = await categoryRepository.createCategory({
      name: data.name,
      slug: await uniqueSlug(data.name),
      description: data.description?.trim() ? data.description : null,
    });
    return toDTO(created);
  } catch (error) {
    // Two admins creating the same slug at the same instant: the DB unique
    // index is the real guard, this just turns it into a friendly message.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new CategoryAdminError("That category already exists — please retry.");
    }
    throw error;
  }
}

export async function updateAdminCategory(
  admin: SafeUser,
  input: unknown,
): Promise<AdminCategoryDTO> {
  assertAdmin(admin);
  const data = updateCategorySchema.parse(input);

  const existing = await categoryRepository.findCategoryById(data.categoryId);
  if (!existing) throw new CategoryAdminError("Category not found.");

  if (data.name && data.name.toLowerCase() !== existing.name.toLowerCase()) {
    const clash = await categoryRepository.findCategoryByNameInsensitive(data.name);
    if (clash && clash.id !== existing.id) {
      throw new CategoryAdminError("A category with that name already exists.");
    }
  }

  const updated = await categoryRepository.updateCategory(existing.id, {
    ...(data.name !== undefined && { name: data.name }),
    ...(data.description !== undefined && { description: data.description.trim() || null }),
    ...(data.status !== undefined && { status: data.status }),
  });
  return toDTO(updated);
}
