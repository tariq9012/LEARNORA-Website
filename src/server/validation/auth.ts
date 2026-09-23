import { z } from "zod";

import { emailSchema, nameSchema, rawPasswordSchema } from "./user";

export const loginSchema = z.object({
  email: emailSchema,
  // Intentionally not `rawPasswordSchema` here: a login attempt with a
  // too-short password should still fail as "Invalid email or password.",
  // not leak a distinct "too short" validation message.
  password: z.string().min(1, "Enter your password"),
});
export type LoginInput = z.infer<typeof loginSchema>;

const passwordConfirmationRefinement = <T extends { password: string; confirmPassword: string }>(
  data: T,
) => data.password === data.confirmPassword;

export const registerSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    password: rawPasswordSchema,
    confirmPassword: z.string(),
    // ADMIN is deliberately not a valid value here — admin accounts are
    // never created through public registration.
    role: z.enum(["STUDENT", "INSTRUCTOR"]).default("STUDENT"),
  })
  .refine(passwordConfirmationRefinement, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
export type RegisterInput = z.infer<typeof registerSchema>;

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, "Reset token is missing"),
    password: rawPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine(passwordConfirmationRefinement, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
