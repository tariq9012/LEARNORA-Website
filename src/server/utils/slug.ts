/** Turns a display title into a URL-safe slug, e.g. "Modern React!" -> "modern-react". */
export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Appends a short random suffix to a slug to resolve a collision. */
export function withUniqueSuffix(slug: string): string {
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${slug}-${suffix}`;
}
