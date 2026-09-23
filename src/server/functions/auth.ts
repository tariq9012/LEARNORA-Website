import { createServerFn } from "@tanstack/react-start";

import {
  login,
  logout,
  registerUser,
  requestPasswordReset,
  resetPassword,
} from "../auth/auth-service";
import { getCurrentUser } from "../auth/guards";
import { toActionError } from "../auth/format-error";
import type { SafeUser } from "../auth/types";

export type AuthActionResult =
  | { success: true; user: SafeUser }
  | { success: false; error: string; fieldErrors?: Record<string, string> };

export type MessageActionResult =
  | { success: true; message: string }
  | { success: false; error: string; fieldErrors?: Record<string, string> };

/**
 * Returns the current authenticated user's safe fields, or null. Called
 * from the root route's `beforeLoad` so SSR renders with the correct auth
 * state from the first response — no logged-out flash.
 */
export const getCurrentUserFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<SafeUser | null> => {
    return getCurrentUser();
  },
);

export const loginFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data)
  .handler(async ({ data }): Promise<AuthActionResult> => {
    try {
      const user = await login(data);
      return { success: true, user };
    } catch (error) {
      return toActionError(error);
    }
  });

export const registerFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data)
  .handler(async ({ data }): Promise<AuthActionResult> => {
    try {
      const user = await registerUser(data);
      return { success: true, user };
    } catch (error) {
      return toActionError(error);
    }
  });

export const logoutFn = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ success: true }> => {
    await logout();
    return { success: true };
  },
);

export const forgotPasswordFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data)
  .handler(async ({ data }): Promise<MessageActionResult> => {
    try {
      const result = await requestPasswordReset(data);
      return { success: true, ...result };
    } catch (error) {
      return toActionError(error);
    }
  });

export const resetPasswordFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data)
  .handler(async ({ data }): Promise<MessageActionResult> => {
    try {
      const result = await resetPassword(data);
      return { success: true, ...result };
    } catch (error) {
      return toActionError(error);
    }
  });
