import bcrypt from "bcryptjs";

// Cost factor for bcrypt. 12 is a reasonable balance of security and
// server latency for a web login endpoint in 2026.
const BCRYPT_COST = 12;

export async function hashPassword(rawPassword: string): Promise<string> {
  return bcrypt.hash(rawPassword, BCRYPT_COST);
}

export async function verifyPassword(rawPassword: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(rawPassword, passwordHash);
}

/**
 * A precomputed bcrypt hash with no matching real password. When a login
 * attempt targets an email that doesn't exist, we still run a bcrypt
 * compare against this hash (which always fails) instead of short-
 * circuiting immediately — so "no such user" and "wrong password" take
 * comparable time and can't be told apart by a timing side-channel.
 */
export const DUMMY_PASSWORD_HASH = bcrypt.hashSync(
  "no-such-account-timing-safety-padding",
  BCRYPT_COST,
);
