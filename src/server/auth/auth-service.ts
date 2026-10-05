import { RESET_TOKEN_TTL_MS } from "./password-reset-mail";
import { runInBackground } from "../lib/background";
import { dispatchPasswordResetEmail } from "./password-reset-mail";
import { getRequestIP } from "@tanstack/react-start/server";

import * as passwordResetRepository from "../repositories/password-reset-repository";
import * as userRepository from "../repositories/user-repository";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "../validation/auth";
import { enforceRateLimit } from "./rate-limit";
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from "./password";
import { createSessionForUser, revokeAllSessionsForUser, revokeCurrentSession } from "./session";
import { generateOpaqueToken, hashOpaqueToken } from "./tokens";
import { toSafeUser, type SafeUser } from "./types";

export class AuthError extends Error {}

function requestIp(): string {
  return getRequestIP({ xForwardedFor: true }) ?? "unknown";
}

/**
 * Registers a new Student or Instructor and immediately signs them in
 * (registration-then-login flow, per Phase 3 spec). ADMIN is not an
 * accepted value — see registerSchema.
 */
export async function registerUser(input: unknown): Promise<SafeUser> {
  enforceRateLimit(`register:${requestIp()}`, 10, 60 * 60 * 1000);

  const data = registerSchema.parse(input);

  const existing = await userRepository.findUserByEmail(data.email);
  if (existing) {
    throw new AuthError("An account with this email already exists.");
  }

  const passwordHash = await hashPassword(data.password);

  const user =
    data.role === "INSTRUCTOR"
      ? await userRepository.createInstructor({ name: data.name, email: data.email, passwordHash })
      : await userRepository.createStudent({ name: data.name, email: data.email, passwordHash });

  await createSessionForUser(user.id);
  return toSafeUser(user);
}

/**
 * Authenticates a user by email/password and starts a new session.
 * Always returns the same generic error for "no such email" and "wrong
 * password" (account enumeration defense), and always runs a bcrypt
 * compare — against a dummy hash when the account doesn't exist — so the
 * two cases take comparable time.
 */
export async function login(input: unknown): Promise<SafeUser> {
  const data = loginSchema.parse(input);
  enforceRateLimit(`login:${requestIp()}`, 20, 15 * 60 * 1000);
  enforceRateLimit(`login:${data.email}`, 10, 15 * 60 * 1000);

  const user = await userRepository.findUserByEmail(data.email);
  const passwordIsValid = await verifyPassword(
    data.password,
    user?.passwordHash ?? DUMMY_PASSWORD_HASH,
  );

  if (!user || !passwordIsValid) {
    throw new AuthError("Invalid email or password.");
  }

  if (user.status !== "ACTIVE") {
    // Deliberately a distinct message: the attacker already had to supply
    // a correct password to reach this branch, so this doesn't add a new
    // account-enumeration oracle the way a wrong-password/no-such-email
    // split would.
    throw new AuthError("This account has been suspended. Contact support for help.");
  }

  await createSessionForUser(user.id);
  return toSafeUser(user);
}

export async function logout(): Promise<void> {
  await revokeCurrentSession();
}

/**
 * Always returns the same generic response regardless of whether the
 * email is registered (account enumeration defense). If it is, a
 * reset token is generated and stored (hashed) and emailed through the
 * configured provider (console in development, Resend in production).
 */
export async function requestPasswordReset(input: unknown): Promise<{ message: string }> {
  enforceRateLimit(`forgot-password:${requestIp()}`, 5, 15 * 60 * 1000);

  const { email } = forgotPasswordSchema.parse(input);
  const user = await userRepository.findUserByEmail(email);

  if (user) {
    const rawToken = generateOpaqueToken();
    const tokenHash = hashOpaqueToken(rawToken);
    await passwordResetRepository.createPasswordResetToken({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    });

    // Background delivery (see password-reset-mail.ts) so neither timing nor a
    // provider outage reveals whether the address exists. runInBackground keeps
    // the Vercel invocation alive until the email has actually been sent.
    runInBackground(dispatchPasswordResetEmail({ id: user.id, email: user.email }, rawToken));
  }

  return {
    message: "If an account exists for this email, password reset instructions have been sent.",
  };
}

/**
 * Completes a password reset: validates the token, updates the password,
 * marks the token used, and revokes every existing session for the user
 * (anyone with an old session cookie is signed out).
 */
export async function resetPassword(input: unknown): Promise<{ message: string }> {
  enforceRateLimit(`reset-password:${requestIp()}`, 10, 60 * 60 * 1000);

  const data = resetPasswordSchema.parse(input);
  const tokenHash = hashOpaqueToken(data.token);
  const resetToken = await passwordResetRepository.findValidPasswordResetTokenByHash(tokenHash);

  if (!resetToken) {
    throw new AuthError("This reset link is invalid or has expired. Request a new one.");
  }

  const passwordHash = await hashPassword(data.password);
  // Claim first, atomically: of several simultaneous requests with the same
  // token only one gets count === 1 and may change the password.
  const claim = await passwordResetRepository.claimPasswordResetToken(resetToken.id);
  if (claim.count !== 1) {
    throw new AuthError("This reset link is invalid or has expired. Request a new one.");
  }
  await userRepository.updatePasswordHash(resetToken.userId, passwordHash);
  await revokeAllSessionsForUser(resetToken.userId);

  return { message: "Your password has been updated. You can now log in." };
}
