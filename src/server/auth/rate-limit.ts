/**
 * Rate limiting for abuse-prone endpoints (login, registration, password
 * reset, messaging, uploads, checkout, reviews, ...).
 *
 * Phase 20: counters now live in PostgreSQL (the same Neon database the app
 * already uses), so every Vercel instance shares one budget per key. Before
 * this the limiter was a per-instance `Map`, which gave an attacker a fresh
 * budget whenever a request landed on a different instance.
 *
 * How it works: one atomic `INSERT … ON CONFLICT DO UPDATE` per check
 * (fixed window). It is correct under concurrency because the row lock
 * serialises increments. Keys are stored as an HMAC (never a raw email / IP).
 *
 * Honest limits of this design:
 *  - It costs one small database round trip per limited request. Only
 *    sensitive endpoints call it.
 *  - Fixed windows allow a short burst at a window boundary (up to 2x).
 *  - If the database is unreachable the limiter falls back to a per-instance
 *    in-memory counter (and logs `ratelimit.store_unavailable`). That keeps the
 *    endpoint protected inside one instance but is NOT distributed, and
 *    the endpoints themselves need the database anyway.
 *  - It is not a DDoS shield. Volumetric abuse needs an edge/WAF layer
 *    (Vercel Firewall), which is outside this codebase.
 *
 * `RATE_LIMIT_STORE=memory` forces the in-memory store (unit tests only).
 */
import { createHmac } from "node:crypto";

import { getServerEnv } from "../env";
import { log } from "../lib/log";

export class RateLimitExceededError extends Error {
  /** Seconds until the window resets (for a Retry-After header). */
  readonly retryAfterSeconds: number;
  constructor(
    message = "Too many attempts. Please wait a moment and try again.",
    retryAfterSeconds = 60,
  ) {
    super(message);
    this.name = "RateLimitExceededError";
    this.retryAfterSeconds = Math.max(1, Math.ceil(retryAfterSeconds));
  }
}

interface Hit {
  count: number;
  resetAt: number;
}

// ---- in-memory store: fallback + tests only -------------------------------------
const memory = new Map<string, Hit>();
function memoryIncrement(key: string, windowMs: number): Hit {
  const now = Date.now();
  const existing = memory.get(key);
  if (!existing || existing.resetAt <= now) {
    const entry = { count: 1, resetAt: now + windowMs };
    memory.set(key, entry);
    // Keep the fallback map bounded.
    if (memory.size > 5000) {
      for (const [k, v] of memory) if (v.resetAt <= now) memory.delete(k);
    }
    return entry;
  }
  existing.count += 1;
  return existing;
}

function bucketKey(key: string): string {
  return createHmac("sha256", getServerEnv().SESSION_SECRET).update(key).digest("hex");
}

// ---- database store ---------------------------------------------------------------
async function databaseIncrement(key: string, windowMs: number): Promise<Hit> {
  const { prisma } = await import("../db/client");
  const windowSeconds = windowMs / 1000;
  const rows = await prisma.$queryRaw<Array<{ count: number; reset_at: Date }>>`
    INSERT INTO rate_limit_buckets ("key", "count", "reset_at")
    VALUES (${bucketKey(key)}, 1, now() + (${windowSeconds}::double precision * interval '1 second'))
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN rate_limit_buckets."reset_at" <= now() THEN 1 ELSE rate_limit_buckets."count" + 1 END,
      "reset_at" = CASE WHEN rate_limit_buckets."reset_at" <= now() THEN EXCLUDED."reset_at" ELSE rate_limit_buckets."reset_at" END
    RETURNING "count", "reset_at"`;
  const row = rows[0];
  if (!row) throw new Error("rate limit upsert returned no row");
  return { count: Number(row.count), resetAt: new Date(row.reset_at).getTime() };
}

/**
 * Throws RateLimitExceededError if `key` has been hit more than `limit` times
 * within `windowMs`. Key by something like `login:<ip>`, never by data an
 * attacker fully controls without also mixing in their IP (or the user id).
 */
export async function enforceRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<void> {
  let hit: Hit;
  if (process.env["RATE_LIMIT_STORE"] === "memory") {
    hit = memoryIncrement(key, windowMs);
  } else {
    try {
      hit = await databaseIncrement(key, windowMs);
    } catch (error) {
      log.error("ratelimit.store_unavailable", error, { scope: key.split(":")[0] });
      hit = memoryIncrement(key, windowMs);
    }
  }
  if (hit.count > limit) {
    throw new RateLimitExceededError(undefined, (hit.resetAt - Date.now()) / 1000);
  }
}

/**
 * Deletes buckets that expired more than an hour ago. Bounded; called by the
 * daily cron. Returns how many rows were removed.
 */
export async function purgeExpiredRateLimitBuckets(batch = 1000): Promise<number> {
  const { prisma } = await import("../db/client");
  const removed = await prisma.$executeRaw`
    DELETE FROM rate_limit_buckets WHERE "key" IN (
      SELECT "key" FROM rate_limit_buckets
      WHERE "reset_at" < now() - interval '1 hour' LIMIT ${batch})`;
  return Number(removed);
}

/** Test helper: forget in-memory counters. */
export function __resetMemoryRateLimitForTests(): void {
  memory.clear();
}
