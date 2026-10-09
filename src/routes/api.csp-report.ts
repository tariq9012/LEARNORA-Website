import { createFileRoute } from "@tanstack/react-router";

/**
 * Phase 20: receives Content-Security-Policy violation reports (the policy's
 * `report-uri`). Browsers send these without cookies, so there is no session or
 * CSRF here; the endpoint changes no application state. It only writes one
 * structured log line per report (origin and directive only: no full URLs, which
 * can carry tokens), caps the body at 8 KB, rate limits per IP and always answers
 * 204 so it can't be used to probe anything.
 */
const noContent = () =>
  new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

function originOnly(value: unknown): string {
  if (typeof value !== "string" || value === "") return "none";
  if (["inline", "eval", "data", "blob", "self"].includes(value)) return value;
  try {
    return new URL(value).origin;
  } catch {
    return "invalid";
  }
}

export const Route = createFileRoute("/api/csp-report")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { getRequestIP } = await import("@tanstack/react-start/server");
          const { enforceRateLimit } = await import("@/server/auth/rate-limit");
          const { log } = await import("@/server/lib/log");
          await enforceRateLimit(
            `csp-report:${getRequestIP({ xForwardedFor: true }) ?? "unknown"}`,
            30,
            60_000,
          );

          const text = await request.text();
          if (text.length > 8 * 1024) return noContent();
          const parsed = JSON.parse(text) as Record<string, Record<string, unknown> | undefined>;
          const r = parsed["csp-report"] ?? {};
          let docPath = "unknown";
          try {
            docPath = new URL(String(r["document-uri"] ?? "")).pathname;
          } catch {
            /* keep "unknown" */
          }
          log.warn("csp.violation", {
            directive: String(
              r["effective-directive"] ?? r["violated-directive"] ?? "unknown",
            ).slice(0, 60),
            blocked: originOnly(r["blocked-uri"]),
            page: docPath.slice(0, 120),
            disposition: String(r["disposition"] ?? "unknown").slice(0, 20),
          });
        } catch {
          /* malformed or rate-limited: say nothing */
        }
        return noContent();
      },
    },
  },
});
