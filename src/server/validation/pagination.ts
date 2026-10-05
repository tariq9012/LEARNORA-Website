import { z } from "zod";

/**
 * The one pagination convention for every Phase 14 listing endpoint —
 * matches the shape moderation.ts (Phase 12) already established
 * (`page`/`pageSize`, 1-indexed, capped at 50) rather than inventing a
 * second one. Spread this into a route's own filter schema:
 *
 *   const listXSchema = z.object({ status: z.enum([...]).optional(), ...paginationFields }).strict();
 */
export const paginationFields = {
  page: z.number().int().min(1).max(1000).optional(),
  pageSize: z.number().int().min(1).max(50).optional(),
};

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

export function resolvePagination(input: {
  page?: number | undefined;
  pageSize?: number | undefined;
}) {
  const page = input.page ?? 1;
  const pageSize = Math.min(input.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

/** Bounded free-text search term — trimmed, capped, never passed through as-is to a raw query. */
export const searchTermSchema = z.string().trim().max(120).optional();
