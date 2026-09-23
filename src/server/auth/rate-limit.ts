/**
 * Rate limiting for sensitive credential endpoints (login, register,
 * forgot-password).
 *
 * IMPORTANT — this is an in-memory limiter. It works correctly for local
 * development and a single running server process, but it is NOT
 * sufficient for a horizontally-scaled production deployment: each
 * instance/pod keeps its own independent counters, so a client can get a
 * fresh limit budget just by landing on a different instance. Before
 * scaling past one instance, replace `store` below with a shared,
 * distributed store (e.g. Redis via INCR + EXPIRE) behind the same
 * `RateLimitStore` interface, and nothing else in this file needs to
 * change.
 */

export interface RateLimitStore {
  /** Increments the counter for `key` and returns the new count plus its
   *  window's expiry, creating the window if it doesn't exist yet. */
  increment(key: string, windowMs: number): { count: number; resetAt: number };
}

class InMemoryRateLimitStore implements RateLimitStore {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  increment(key: string, windowMs: number) {
    const now = Date.now();
    const existing = this.hits.get(key);

    if (!existing || existing.resetAt <= now) {
      const entry = { count: 1, resetAt: now + windowMs };
      this.hits.set(key, entry);
      return entry;
    }

    existing.count += 1;
    return existing;
  }
}

const store: RateLimitStore = new InMemoryRateLimitStore();

export class RateLimitExceededError extends Error {
  constructor(message = "Too many attempts. Please wait a moment and try again.") {
    super(message);
    this.name = "RateLimitExceededError";
  }
}

/**
 * Throws RateLimitExceededError if `key` has been hit more than `limit`
 * times within `windowMs`. Callers should key by something like
 * `login:<ip>` or `login:<ip>:<email>` — never by data alone that an
 * attacker fully controls without also mixing in their IP.
 */
export function enforceRateLimit(key: string, limit: number, windowMs: number): void {
  const { count } = store.increment(key, windowMs);
  if (count > limit) {
    throw new RateLimitExceededError();
  }
}
