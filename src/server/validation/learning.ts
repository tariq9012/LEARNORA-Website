import { z } from "zod";

export const courseSlugSchema = z.object({
  courseSlug: z.string().trim().min(1, "Course is required"),
});

export const markLessonCompleteSchema = z.object({
  courseSlug: z.string().trim().min(1, "Course is required"),
  lessonId: z.string().trim().min(1, "Lesson is required"),
  completed: z.boolean(),
});

export const updateVideoProgressSchema = z.object({
  courseSlug: z.string().trim().min(1, "Course is required"),
  lessonId: z.string().trim().min(1, "Lesson is required"),
  watchedSeconds: z
    .number()
    .min(0)
    .max(60 * 60 * 24), // sanity ceiling, real clamp is against lesson duration server-side
  ended: z.boolean().default(false),
});
