import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  ForbiddenError,
  UnauthorizedError,
  requireCurrentUser,
  requireStudent,
} from "../auth/guards";
import { RateLimitExceededError } from "../auth/rate-limit";
import { AccountSecurityError, changeMyPassword } from "../services/account-security-service";
import { getBillingSummary } from "../services/checkout-service";
import {
  ProfileError,
  getMyAccount,
  updateMyAccountName,
  updateMyInstructorProfile,
  updateMyStudentProfile,
} from "../services/profile-service";
import {
  SessionManagementError,
  listMySessions,
  revokeMyOtherSessions,
  revokeMySession,
} from "../services/session-management-service";
import { sessionIdSchema, updateAccountNameSchema } from "../validation/account";
import type {
  AccountOverviewDTO,
  BillingSummaryDTO,
  InstructorPrivateProfileDTO,
  SessionDTO,
  StudentProfileDTO,
} from "../dto/account";

/**
 * Account/profile/security/billing server functions (Phase 13). Identity
 * for every one of these comes from the authenticated session
 * (requireCurrentUser/requireStudent) — none of them accepts a userId, so
 * one account can never read or edit another's data. These are
 * createServerFn handlers, so they keep TanStack Start's built-in CSRF
 * protection for state-changing calls (see auth/instructor-guard.ts's
 * comment for why the raw media routes need a separate mechanism and
 * these don't).
 */

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

function toActionError(error: unknown): { success: false; error: string } {
  if (error instanceof z.ZodError) {
    return { success: false, error: error.issues[0]?.message ?? "Invalid input." };
  }
  if (error instanceof UnauthorizedError) {
    return { success: false, error: "Please log in to continue." };
  }
  if (error instanceof ForbiddenError) {
    return { success: false, error: error.message };
  }
  if (
    error instanceof ProfileError ||
    error instanceof AccountSecurityError ||
    error instanceof SessionManagementError ||
    error instanceof RateLimitExceededError
  ) {
    return { success: false, error: error.message };
  }
  console.error("[account] unexpected error", error);
  return { success: false, error: "Something went wrong. Please try again." };
}

export const getMyAccountFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<AccountOverviewDTO> => {
    const user = await requireCurrentUser();
    return getMyAccount(user);
  },
);

export const updateMyAccountNameFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data)
  .handler(async ({ data }): Promise<ActionResult<AccountOverviewDTO>> => {
    try {
      const user = await requireCurrentUser();
      const parsed = updateAccountNameSchema.parse(data);
      await updateMyAccountName(user, parsed.name);
      return { success: true, data: await getMyAccount(user) };
    } catch (error) {
      return toActionError(error);
    }
  });

export const updateStudentProfileFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data)
  .handler(async ({ data }): Promise<ActionResult<StudentProfileDTO>> => {
    try {
      const user = await requireCurrentUser();
      const result = await updateMyStudentProfile(user, data);
      return { success: true, data: result };
    } catch (error) {
      return toActionError(error);
    }
  });

export const updateInstructorProfileFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data)
  .handler(async ({ data }): Promise<ActionResult<InstructorPrivateProfileDTO>> => {
    try {
      const user = await requireCurrentUser();
      const result = await updateMyInstructorProfile(user, data);
      return { success: true, data: result };
    } catch (error) {
      return toActionError(error);
    }
  });

export const changePasswordFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data)
  .handler(async ({ data }): Promise<ActionResult<{ message: string }>> => {
    try {
      const user = await requireCurrentUser();
      const result = await changeMyPassword(user, data);
      return { success: true, data: result };
    } catch (error) {
      return toActionError(error);
    }
  });

export const getMySessionsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<SessionDTO[]> => {
    const user = await requireCurrentUser();
    return listMySessions(user);
  },
);

export const revokeSessionFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => sessionIdSchema.parse(data))
  .handler(async ({ data }): Promise<ActionResult<{ ok: true }>> => {
    try {
      const user = await requireCurrentUser();
      await revokeMySession(user, data.sessionId);
      return { success: true, data: { ok: true } };
    } catch (error) {
      return toActionError(error);
    }
  });

export const revokeOtherSessionsFn = createServerFn({ method: "POST" }).handler(
  async (): Promise<ActionResult<{ ok: true }>> => {
    try {
      const user = await requireCurrentUser();
      await revokeMyOtherSessions(user);
      return { success: true, data: { ok: true } };
    } catch (error) {
      return toActionError(error);
    }
  },
);

/** Students only — instructors get their own finance figures from /instructor/earnings instead. */
export const getBillingSummaryFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<BillingSummaryDTO> => {
    const user = await requireStudent();
    return getBillingSummary(user);
  },
);
