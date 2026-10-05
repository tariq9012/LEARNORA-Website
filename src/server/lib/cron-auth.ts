import { timingSafeEqual } from "node:crypto";

/**
 * Authorizes a scheduled-job request. Fails CLOSED: with no CRON_SECRET
 * configured nothing is authorized, so an unconfigured deployment can never
 * expose an unauthenticated cleanup endpoint.
 *
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when the project
 * has a CRON_SECRET environment variable.
 */
export type CronAuthResult = "ok" | "not_configured" | "unauthorized";

export function checkCronAuth(
  authorizationHeader: string | null,
  secret: string | undefined,
): CronAuthResult {
  if (!secret) return "not_configured";
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(authorizationHeader ?? "");
  if (given.length !== expected.length) return "unauthorized";
  return timingSafeEqual(given, expected) ? "ok" : "unauthorized";
}
