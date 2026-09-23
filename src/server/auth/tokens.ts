import { createHmac, randomBytes } from "node:crypto";

import { getServerEnv } from "../env";

/**
 * Generates a cryptographically random, URL-safe opaque token. This is
 * what goes into a cookie or a reset-link URL — it is never stored
 * anywhere in raw form.
 */
export function generateOpaqueToken(byteLength = 32): string {
  return randomBytes(byteLength).toString("base64url");
}

/**
 * Hashes an opaque token with an HMAC keyed by SESSION_SECRET before it's
 * stored (as Session.tokenHash / PasswordResetToken.tokenHash). Keying the
 * hash with a server secret means a stolen database row alone is not
 * enough to derive a valid cookie value.
 */
export function hashOpaqueToken(rawToken: string): string {
  const { SESSION_SECRET } = getServerEnv();
  return createHmac("sha256", SESSION_SECRET).update(rawToken).digest("hex");
}
