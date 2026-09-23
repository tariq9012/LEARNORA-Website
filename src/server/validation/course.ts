import { z } from "zod";

export const courseLevelSchema = z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED", "ALL_LEVELS"]);

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(160)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Slug must be lowercase, alphanumeric, and hyphen-separated",
  );

export const moneySchema = z
  .number()
  .nonnegative("Price cannot be negative")
  .multipleOf(0.01, "Price can have at most 2 decimal places");

export const courseInputSchema = z
  .object({
    title: z.string().trim().min(3).max(200),
    slug: slugSchema,
    subtitle: z.string().trim().max(300).optional(),
    description: z.string().trim().max(10_000).optional(),
    thumbnail: z.string().url().optional(),
    previewVideo: z.string().url().optional(),
    categoryId: z.string().min(1, "Category is required"),
    level: courseLevelSchema.default("ALL_LEVELS"),
    language: z.string().trim().min(2).max(50).default("English"),
    price: moneySchema,
    discountPrice: moneySchema.optional(),
    requirements: z.array(z.string().trim().min(1)).max(30).default([]),
    learningOutcomes: z.array(z.string().trim().min(1)).max(30).default([]),
    targetAudience: z.array(z.string().trim().min(1)).max(30).default([]),
  })
  .refine((data) => data.discountPrice === undefined || data.discountPrice <= data.price, {
    message: "Discount price cannot exceed the regular price",
    path: ["discountPrice"],
  });
export type CourseInput = z.infer<typeof courseInputSchema>;

export const courseSectionInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  position: z.number().int().nonnegative(),
});
export type CourseSectionInput = z.infer<typeof courseSectionInputSchema>;

export const lessonTypeSchema = z.enum(["VIDEO", "ARTICLE", "QUIZ"]);

export const lessonInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  type: lessonTypeSchema.default("VIDEO"),
  videoUrl: z.string().url().optional(),
  content: z.string().max(50_000).optional(),
  duration: z.number().int().nonnegative().optional(),
  position: z.number().int().nonnegative(),
  isPreview: z.boolean().default(false),
});
export type LessonInput = z.infer<typeof lessonInputSchema>;

export const reviewInputSchema = z.object({
  rating: z.number().int().min(1, "Rating must be at least 1").max(5, "Rating cannot exceed 5"),
  comment: z.string().trim().max(4000).optional(),
});
export type ReviewInput = z.infer<typeof reviewInputSchema>;
