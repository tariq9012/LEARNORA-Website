import { createHmac, timingSafeEqual } from "node:crypto";

import { getRequestHeader } from "@tanstack/react-start/server";

import { getServerEnv } from "../env";

/**
 * Defense-in-depth CSRF protection for the Phase 7 raw media upload/
 * remove routes (server.handlers-based, not createServerFn) — those
 * don't go through TanStack Start's built-in server-function CSRF
 * middleware, since "server route" dispatch is a separate phase from
 * "server function" dispatch. This closes that gap explicitly.
 *
 * Design: double-submit cookie, stateless (nothing new stored in the
 * database). The token is deterministically derived from the caller's
 * own session cookie value via HMAC-SHA256, so:
 *   - it's never a hardcoded or client-generatable value
 *   - the server never needs to persist or look anything up to verify it
 *   - a distinct HMAC context ("csrf" below) from session-token hashing
 *     (see tokens.ts) means leaking one derived value never reveals the
 *     other, and neither ever reveals SESSION_SECRET itself (HMAC is
 *     one-way)
 *
 * The derived value is exposed to the browser in a separate, NOT
 * httpOnly cookie (see session.ts's ensureCsrfCookie) so same-origin
 * JavaScript can read it and echo it back in a request header. A
 * cross-site attacker's page cannot read a cookie set for our origin
 * (browsers enforce this), so it cannot construct a valid header value
 * even though the cookie itself would be sent automatically — the
 * security comes from requiring the HEADER, not from the cookie's mere
 * presence.
 */

export const CSRF_COOKIE_NAME = "learnora_csrf";
export const CSRF_HEADER_NAME = "x-csrf-token";

export class CsrfError extends Error {
  constructor(
    message = "This request could not be verified. Please refresh the page and try again.",
  ) {
    super(message);
  }
}

/** Derives the expected CSRF token for a given (raw, unhashed) session token. Never call with SESSION_SECRET or any other secret directly — only ever with the session cookie's value. */
export function deriveCsrfToken(rawSessionToken: string): string {
  const { SESSION_SECRET } = getServerEnv();
  return createHmac("sha256", `${SESSION_SECRET}:csrf`).update(rawSessionToken).digest("hex");
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // timingSafeEqual throws on length mismatch rather than returning
  // false, and comparing lengths first is not itself a useful timing
  // oracle (lengths are fixed-size hex digests here, not secret-dependent).
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Verifies the `X-CSRF-Token` request header against the value derived
 * from the caller's own session. Call this AFTER your normal auth guard
 * (requireApprovedInstructor(), etc.) — it only proves the request came
 * from our own frontend for an already-authenticated session, it is not
 * itself an authentication check.
 */
export function assertValidCsrfToken(rawSessionToken: string): void {
  const provided = getRequestHeader(CSRF_HEADER_NAME);
  if (!provided) throw new CsrfError();
  const expected = deriveCsrfToken(rawSessionToken);
  if (!timingSafeEqualStrings(provided, expected)) throw new CsrfError();
}
