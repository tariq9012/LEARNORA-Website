import { z } from "zod";

import { nameSchema, rawPasswordSchema } from "./user";

/**
 * Login email is intentionally NOT editable through this schema — see
 * Phase 13 spec item 11. There is no email-delivery provider configured
 * yet, so a self-serve email change can't be safely verified; email stays
 * read-only until that infrastructure exists (tracked as a Phase 14+ item
 * in the final report, same policy `requestPasswordReset` already
 * documents for the forgot-password flow).
 */
export const updateAccountNameSchema = z.object({ name: nameSchema }).strict();
export type UpdateAccountNameInput = z.infer<typeof updateAccountNameSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required").max(256),
    newPassword: rawPasswordSchema,
    confirmPassword: z.string().min(1, "Please confirm your new password").max(256),
  })
  .strict()
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "New password and confirmation don't match.",
    path: ["confirmPassword"],
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: "New password must be different from your current password.",
    path: ["newPassword"],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const sessionIdSchema = z.object({ sessionId: z.string().min(1).max(64) }).strict();
export type SessionIdInput = z.infer<typeof sessionIdSchema>;
