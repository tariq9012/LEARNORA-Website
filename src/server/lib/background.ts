import { waitUntil } from "@vercel/functions";

/**
 * Keeps a serverless invocation alive until `work` settles, WITHOUT making the
 * caller wait for it.
 *
 * Why this exists: on Vercel a function may be frozen as soon as the response
 * is sent, so a bare "fire and forget" promise (for example sending a password
 * reset email) can be silently cut off. `waitUntil` tells the platform to
 * finish it first. Outside Vercel (local dev, node-server, tests) there is no
 * request context, `waitUntil` is a no-op and the promise simply runs on, which
 * is the previous behaviour.
 *
 * `work` must never reject (callers pass promises that already catch their own
 * errors); a stray rejection is swallowed here so it can never become an
 * unhandled rejection that takes the process down.
 */
export function runInBackground(work: Promise<unknown>): void {
  const safe = work.catch(() => undefined);
  try {
    waitUntil(safe);
  } catch {
    // No platform context available: `safe` keeps running by itself.
  }
}
