import { hashPassword, verifyPassword } from "../auth/password";
import { getCurrentSessionId } from "../auth/session";
import { enforceRateLimit } from "../auth/rate-limit";
import * as sessionRepository from "../repositories/session-repository";
import * as userRepository from "../repositories/user-repository";
import { changePasswordSchema } from "../validation/account";
import type { SafeUser } from "../auth/types";

export class AccountSecurityError extends Error {}

/**
 * Changes the signed-in user's own password.
 *
 * Session policy (Phase 13 spec item 13 — documented here, not left
 * implicit): every OTHER session is revoked immediately so a stolen
 * cookie elsewhere stops working the moment the real owner changes their
 * password, but the session making THIS request is deliberately kept
 * alive — the user just proved they know the new password by typing the
 * old one correctly, so forcing them to log back in on the device they're
 * already using adds friction without adding security.
 */
export async function changeMyPassword(
  user: SafeUser,
  input: unknown,
): Promise<{ message: string }> {
  enforceRateLimit(`change-password:${user.id}`, 5, 15 * 60 * 1000);

  const data = changePasswordSchema.parse(input);

  const account = await userRepository.findUserById(user.id);
  if (!account) throw new AccountSecurityError("Account not found.");

  const isCurrentPasswordValid = await verifyPassword(data.currentPassword, account.passwordHash);
  if (!isCurrentPasswordValid) {
    throw new AccountSecurityError("Current password is incorrect.");
  }

  const passwordHash = await hashPassword(data.newPassword);
  await userRepository.updatePasswordHash(user.id, passwordHash);

  const currentSessionId = await getCurrentSessionId();
  await sessionRepository.deleteOtherSessionsForUser(user.id, currentSessionId);

  return {
    message: "Your password has been updated. Every other signed-in device has been logged out.",
  };
}
