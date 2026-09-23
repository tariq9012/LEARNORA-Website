import { z } from "zod";

import { AuthError } from "./auth-service";
import { RateLimitExceededError } from "./rate-limit";

export type ActionErrorResult = {
  success: false;
  error: string;
  fieldErrors?: Record<string, string>;
};

/**
 * Converts any error thrown by an auth service call into a safe,
 * user-facing message (and per-field messages for validation errors).
 * Never surfaces a raw Prisma/database error or a stack trace — those are
 * logged server-side only.
 */
export function toActionError(error: unknown): ActionErrorResult {
  if (error instanceof z.ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of error.issues) {
      const key = issue.path.join(".") || "form";
      if (!(key in fieldErrors)) fieldErrors[key] = issue.message;
    }
    return { success: false, error: "Please fix the highlighted fields.", fieldErrors };
  }

  if (error instanceof AuthError || error instanceof RateLimitExceededError) {
    return { success: false, error: error.message };
  }

  console.error("[auth] unexpected error", error);
  return { success: false, error: "Something went wrong. Please try again." };
}
