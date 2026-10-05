import { getEmailProvider, EmailDeliveryError, type EmailProvider } from "../email";
import { buildPasswordResetEmail } from "../email/templates";
import { getServerEnv } from "../env";

export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Sends the reset email in the background. The caller's response never waits
 * for, or depends on, delivery — so response time and outcome are identical
 * for registered and unregistered addresses. A failure is logged WITHOUT the
 * token, the email address or any provider response body; it is never
 * reported to the client. Returns the delivery promise only so tests can
 * await it.
 */
export function dispatchPasswordResetEmail(
  user: { id: string; email: string },
  rawToken: string,
  provider: EmailProvider = getEmailProvider(),
  appUrl: string = getServerEnv().APP_URL,
): Promise<void> {
  const message = buildPasswordResetEmail({
    to: user.email,
    resetUrl: `${appUrl}/reset-password?token=${encodeURIComponent(rawToken)}`,
    expiresInMinutes: RESET_TOKEN_TTL_MS / 60_000,
  });
  return provider.send(message).catch((error: unknown) => {
    const status = error instanceof EmailDeliveryError ? error.status : undefined;
    const code = error instanceof EmailDeliveryError ? error.code : undefined;
    console.error(
      `[email] password-reset delivery failed provider=${provider.name}${status ? ` status=${status}` : ""}${code ? ` code=${code}` : ""} userId=${user.id}`,
    );
  });
}
