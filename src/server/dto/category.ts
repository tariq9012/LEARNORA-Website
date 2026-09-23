export type CategoryDTO = {
  id: string;
  slug: string;
  name: string;
  blurb: string;
  /** Count of PUBLISHED courses in this category only. */
  courseCount: number;
  icon: string;
};
