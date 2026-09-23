import { z } from "zod";

// Shared primitives -----------------------------------------------------

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address");

export const nameSchema = z.string().trim().min(2, "Name must be at least 2 characters").max(120);

// Note: password *strength* rules belong to Phase 3 (auth). This just
// bounds the raw input size before it reaches the hashing step.
export const rawPasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(256);

// Profiles ----------------------------------------------------------------

export const studentProfileInputSchema = z.object({
  bio: z.string().max(2000).optional(),
  headline: z.string().max(200).optional(),
  interests: z.array(z.string().trim().min(1)).max(50).default([]),
  learningGoals: z.string().max(2000).optional(),
  preferredLanguage: z.string().max(50).optional(),
});
export type StudentProfileInput = z.infer<typeof studentProfileInputSchema>;

export const instructorProfileInputSchema = z.object({
  headline: z.string().max(200).optional(),
  bio: z.string().max(4000).optional(),
  expertise: z.array(z.string().trim().min(1)).max(50).default([]),
  yearsExperience: z.number().int().min(0).max(80).optional(),
  website: z.string().url().optional(),
  socialLinks: z.record(z.string().url()).optional(),
});
export type InstructorProfileInput = z.infer<typeof instructorProfileInputSchema>;
