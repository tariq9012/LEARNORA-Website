/**
 * Notification links must be INTERNAL application paths only. This guard is
 * used in two places on purpose:
 *   - server: before a link is ever written to the database, and
 *   - client: again before a stored link is followed, so even a bad row
 *     (or a future bug that stores one) can never become an open redirect.
 *
 * Accepted:  "/student/purchases", "/student/messages?c=abc123"
 * Rejected:  "https://evil.example", "//evil.example", "/\\evil.example",
 *            "javascript:alert(1)", anything with whitespace/control chars,
 *            relative paths, or absurdly long values.
 *
 * Pure and dependency-free so it is safe to import from client components.
 */
const MAX_PATH_LENGTH = 200;

export function isSafeInternalPath(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.length === 0 || value.length > MAX_PATH_LENGTH) return false;
  // Must be an absolute path on THIS origin: one leading slash, not "//".
  if (!value.startsWith("/") || value.startsWith("//")) return false;
  // No backslashes (browsers treat "/\host" like "//host"), whitespace or control characters.
  // eslint-disable-next-line no-control-regex
  if (/[\\\s\u0000-\u001f\u007f]/.test(value)) return false;
  return true;
}

/** Returns the path if it is safe, otherwise null. */
export function sanitizeInternalPath(value: unknown): string | null {
  return isSafeInternalPath(value) ? value : null;
}
