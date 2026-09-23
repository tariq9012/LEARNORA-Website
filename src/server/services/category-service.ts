import * as categoryRepository from "../repositories/category-repository";
import type { CategoryDTO } from "../dto/category";

function mapCategoryToDTO(category: {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  _count: { courses: number };
}): CategoryDTO {
  return {
    id: category.id,
    slug: category.slug,
    name: category.name,
    blurb: category.description ?? "",
    courseCount: category._count.courses,
    icon: category.icon ?? "Code2",
  };
}

export async function listCategories(): Promise<CategoryDTO[]> {
  const rows = await categoryRepository.findActiveCategories();
  return rows.map(mapCategoryToDTO);
}

export async function getCategoryBySlug(slug: string): Promise<CategoryDTO | null> {
  const category = await categoryRepository.findActiveCategoryBySlug(slug);
  return category ? mapCategoryToDTO(category) : null;
}
