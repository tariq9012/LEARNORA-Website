import {
  deleteCookie,
  getCookie,
  getRequestHeader,
  getRequestIP,
  setCookie,
} from "@tanstack/react-start/server";

import { getServerEnv } from "../env";
import * as sessionRepository from "../repositories/session-repository";
import * as userRepository from "../repositories/user-repository";
import { CSRF_COOKIE_NAME, deriveCsrfToken } from "./csrf";
import { generateOpaqueToken, hashOpaqueToken } from "./tokens";

const SESSION_COOKIE_NAME = "learnora_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function sessionCookieOptions(expiresAt: Date) {
  const env = getServerEnv();
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: env.NODE_ENV === "production",
    expires: expiresAt,
  };
}

function requestMeta() {
  const userAgent = getRequestHeader("user-agent");
  const ipAddress = getRequestIP({ xForwardedFor: true });
  return {
    ...(userAgent !== undefined && { userAgent }),
    ...(ipAddress !== undefined && { ipAddress }),
  };
}

/**
 * Makes sure the (non-httpOnly) CSRF cookie is present and matches the
 * current session, setting/refreshing it if not. Called from every
 * place a valid session is established (login/register and every
 * authenticated request) so the raw media routes' CSRF check always has
 * a cookie to work with — including for sessions that existed before
 * this protection was added, which get the cookie provisioned on their
 * very next authenticated request rather than being locked out.
 *
 * Cheap to call repeatedly: skips the cookie write entirely once the
 * value already matches.
 */
function ensureCsrfCookie(rawSessionToken: string, expiresAt: Date) {
  const expected = deriveCsrfToken(rawSessionToken);
  if (getCookie(CSRF_COOKIE_NAME) === expected) return;
  const env = getServerEnv();
  setCookie(CSRF_COOKIE_NAME, expected, {
    httpOnly: false, // must be readable by same-origin JS to echo back in a header
    sameSite: "lax",
    path: "/",
    secure: env.NODE_ENV === "production",
    expires: expiresAt,
  });
}

/**
 * Creates a brand-new database session for a user and sets the session
 * cookie on the response. Used for both login and registration, and
 * doubles as "session rotation" — every call mints a fresh, unrelated
 * token rather than reusing/extending an old one (relevant after a
 * privilege-relevant event like a password reset).
 */
export async function createSessionForUser(userId: string): Promise<void> {
  const rawToken = generateOpaqueToken();
  const tokenHash = hashOpaqueToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await sessionRepository.createSession({
    userId,
    tokenHash,
    expiresAt,
    ...requestMeta(),
  });

  setCookie(SESSION_COOKIE_NAME, rawToken, sessionCookieOptions(expiresAt));
  ensureCsrfCookie(rawToken, expiresAt);
}

/**
 * Reads the session cookie, validates it against the database, and
 * returns the associated user — or null if there's no session, the
 * session is expired/unknown, or the account is no longer in good
 * standing (SUSPENDED/BANNED), in which case the session is also revoked
 * so a suspended account can't keep using an old valid cookie.
 */
export async function getSessionUser() {
  const rawToken = getCookie(SESSION_COOKIE_NAME);
  if (!rawToken) return null;

  const tokenHash = hashOpaqueToken(rawToken);
  const session = await sessionRepository.findValidSessionByTokenHash(tokenHash);
  if (!session) {
    deleteCookie(SESSION_COOKIE_NAME, { path: "/" });
    return null;
  }

  const user = await userRepository.findUserById(session.userId);
  if (!user || user.status !== "ACTIVE") {
    await sessionRepository.deleteSessionByTokenHash(tokenHash);
    deleteCookie(SESSION_COOKIE_NAME, { path: "/" });
    return null;
  }

  // Best-effort activity timestamp; never blocks the request on failure.
  void sessionRepository.touchSession(session.id);
  ensureCsrfCookie(rawToken, session.expiresAt);

  return user;
}

/** Reads the raw session token straight off the request cookie — used only to derive/verify the CSRF token (see csrf.ts). Never logged, never sent anywhere else. */
export function getRawSessionToken(): string | null {
  return getCookie(SESSION_COOKIE_NAME) ?? null;
}

/** Revokes the current session (if any) and clears the cookie. Used for logout. */
export async function revokeCurrentSession(): Promise<void> {
  const rawToken = getCookie(SESSION_COOKIE_NAME);
  if (rawToken) {
    await sessionRepository.deleteSessionByTokenHash(hashOpaqueToken(rawToken));
  }
  deleteCookie(SESSION_COOKIE_NAME, { path: "/" });
  deleteCookie(CSRF_COOKIE_NAME, { path: "/" });
}

/** Revokes every session for a user — used after a password reset. */
export async function revokeAllSessionsForUser(userId: string): Promise<void> {
  await sessionRepository.deleteAllSessionsForUser(userId);
}
