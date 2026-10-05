import { z } from "zod";

import { paginationFields, searchTermSchema } from "./pagination";

// Deliberately NO instructorId field anywhere in these schemas — the
// instructor is always the authenticated session user, and .strict()
// rejects a client that tries to send one.

export const listInstructorStudentsSchema = z
  .object({
    search: searchTermSchema,
    status: z.enum(["ACTIVE", "COMPLETED", "CANCELLED"]).optional(),
    courseId: z.string().min(1).max(64).optional(),
    ...paginationFields,
  })
  .strict();

export const listInstructorReviewsSchema = z
  .object({
    courseId: z.string().min(1).max(64).optional(),
    rating: z.number().int().min(1).max(5).optional(),
    order: z.enum(["newest", "oldest"]).optional(),
    ...paginationFields,
  })
  .strict();
