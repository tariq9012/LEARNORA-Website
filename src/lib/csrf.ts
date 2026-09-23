const CSRF_COOKIE_NAME = "learnora_csrf";
export const CSRF_HEADER_NAME = "x-csrf-token";

/**
 * Reads the CSRF cookie's value so it can be echoed back in the
 * X-CSRF-Token header on state-changing requests to the raw media
 * routes (upload/remove) — see src/server/auth/csrf.ts for why this
 * cookie is deliberately NOT httpOnly and why that's still safe. Every
 * fetch() in this app that hits an /api/instructor/media/* POST or
 * DELETE endpoint must include this header.
 */
export function getCsrfToken(): string {
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE_NAME}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
}
