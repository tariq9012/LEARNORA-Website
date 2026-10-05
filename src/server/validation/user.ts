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

// `.strict()` rejects any field beyond the ones listed here (see Phase 13
// spec item 6/29/37J — unexpected fields must be rejected, never silently
// dropped or mass-assigned into the Prisma update).
export const studentProfileInputSchema = z
  .object({
    bio: z.string().trim().max(2000).optional(),
    headline: z.string().trim().max(200).optional(),
    interests: z.array(z.string().trim().min(1).max(60)).max(50).default([]),
    learningGoals: z.string().trim().max(2000).optional(),
    preferredLanguage: z.string().trim().max(50).optional(),
    website: z.string().trim().url("Enter a valid URL").max(300).optional().or(z.literal("")),
    location: z.string().trim().max(120).optional(),
  })
  .strict();
export type StudentProfileInput = z.infer<typeof studentProfileInputSchema>;

export const instructorProfileInputSchema = z
  .object({
    headline: z.string().trim().max(200).optional(),
    bio: z.string().trim().max(4000).optional(),
    expertise: z.array(z.string().trim().min(1).max(60)).max(50).default([]),
    yearsExperience: z.number().int().min(0).max(80).optional(),
    website: z.string().trim().url("Enter a valid URL").max(300).optional().or(z.literal("")),
    // Bounded to a small, fixed set of platforms so this can't be abused as
    // an arbitrary-size free-form store — an oversized object is rejected
    // outright rather than truncated.
    socialLinks: z
      .record(z.string().trim().url("Enter a valid URL").max(300))
      .refine((links) => Object.keys(links).length <= 10, "Too many social links.")
      .optional(),
  })
  .strict();
export type InstructorProfileInput = z.infer<typeof instructorProfileInputSchema>;
