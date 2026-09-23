import { z } from "zod";

import { courseLevelSchema, lessonTypeSchema, moneySchema } from "./course";

export const courseBasicsSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(200),
  subtitle: z.string().trim().max(300).optional(),
  description: z.string().trim().max(10_000).optional(),
  categoryId: z.string().min(1, "Category is required"),
  level: courseLevelSchema.default("ALL_LEVELS"),
  language: z.string().trim().min(2).max(50).default("English"),
  thumbnail: z.string().url("Enter a valid URL").optional(),
  previewVideo: z.string().url("Enter a valid URL").optional(),
});
export type CourseBasicsInput = z.infer<typeof courseBasicsSchema>;

export const coursePricingSchema = z
  .object({
    price: moneySchema,
    discountPrice: moneySchema.optional(),
  })
  .refine((d) => d.discountPrice === undefined || d.discountPrice <= d.price, {
    message: "Discount price cannot exceed the regular price",
    path: ["discountPrice"],
  });
export type CoursePricingInput = z.infer<typeof coursePricingSchema>;

export const courseOutcomesSchema = z.object({
  learningOutcomes: z.array(z.string().trim().min(1)).max(30).default([]),
  requirements: z.array(z.string().trim().min(1)).max(30).default([]),
  targetAudience: z.array(z.string().trim().min(1)).max(30).default([]),
});
export type CourseOutcomesInput = z.infer<typeof courseOutcomesSchema>;

/** Used for updates — every field optional, only supplied ones change. */
export const courseMetadataUpdateSchema = z
  .object({
    title: courseBasicsSchema.shape.title.optional(),
    subtitle: courseBasicsSchema.shape.subtitle,
    description: courseBasicsSchema.shape.description,
    categoryId: courseBasicsSchema.shape.categoryId.optional(),
    level: courseLevelSchema.optional(),
    language: courseBasicsSchema.shape.language.optional(),
    thumbnail: courseBasicsSchema.shape.thumbnail,
    previewVideo: courseBasicsSchema.shape.previewVideo,
    price: moneySchema.optional(),
    discountPrice: moneySchema.optional(),
    learningOutcomes: courseOutcomesSchema.shape.learningOutcomes.optional(),
    requirements: courseOutcomesSchema.shape.requirements.optional(),
    targetAudience: courseOutcomesSchema.shape.targetAudience.optional(),
  })
  .refine(
    (d) => d.discountPrice === undefined || d.price === undefined || d.discountPrice <= d.price,
    {
      message: "Discount price cannot exceed the regular price",
      path: ["discountPrice"],
    },
  );
export type CourseMetadataUpdateInput = z.infer<typeof courseMetadataUpdateSchema>;

export const sectionCreateSchema = z.object({
  title: z.string().trim().min(1, "Section title is required").max(200),
  description: z.string().trim().max(2000).optional(),
});
export type SectionCreateInput = z.infer<typeof sectionCreateSchema>;

export const sectionUpdateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional(),
});
export type SectionUpdateInput = z.infer<typeof sectionUpdateSchema>;

export const lessonCreateSchema = z.object({
  title: z.string().trim().min(1, "Lesson title is required").max(200),
  description: z.string().trim().max(2000).optional(),
  type: lessonTypeSchema.default("VIDEO"),
  videoUrl: z.string().url("Enter a valid URL").optional(),
  content: z.string().max(50_000).optional(),
  duration: z.number().int().nonnegative().optional(),
  isPreview: z.boolean().default(false),
});
export type LessonCreateInput = z.infer<typeof lessonCreateSchema>;

export const lessonUpdateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  type: lessonTypeSchema.optional(),
  videoUrl: z.string().url("Enter a valid URL").optional(),
  content: z.string().max(50_000).optional(),
  duration: z.number().int().nonnegative().optional(),
  isPreview: z.boolean().optional(),
});
export type LessonUpdateInput = z.infer<typeof lessonUpdateSchema>;

/** Reorder inputs take an explicit ordered ID list — never raw position numbers from the client. */
export const reorderSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1, "Nothing to reorder"),
});
export type ReorderInput = z.infer<typeof reorderSchema>;

export const rejectCourseSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, "Give the instructor a specific, useful reason (at least 10 characters)")
    .max(2000),
});
export type RejectCourseInput = z.infer<typeof rejectCourseSchema>;
