/**
 * Phase 20: Content-Security-Policy and Strict-Transport-Security.
 *
 * Pure functions (no framework imports) so they are unit-testable and safe to
 * import from the server entry.
 *
 * What the policy allows, and why:
 *  - script-src 'self' 'unsafe-inline': TanStack Start streams inline bootstrap
 *    and dehydration <script> tags into every HTML page. Without a per-request
 *    nonce wired through the router those cannot be allowed any other way. This
 *    is a REAL weakness: injected inline script would not be blocked by CSP.
 *    There is no 'unsafe-eval'. Moving to nonces is future work (see report).
 *  - style-src 'unsafe-inline' + Google Fonts: Tailwind/Radix/recharts set inline
 *    styles; fonts load from fonts.googleapis.com / fonts.gstatic.com.
 *  - connect-src: the browser PUTs large uploads straight to the R2 endpoint
 *    (path-style https://<account>.r2.cloudflarestorage.com or virtual-hosted
 *    https://<bucket>.<account>.…), derived from S3_ENDPOINT at runtime.
 *  - img/media 'self' data: blob:: course media is served through Learnora's own
 *    authorized /media routes (the bucket is private and never linked directly).
 *  - frame-ancestors 'none', object-src 'none', base-uri/form-action 'self'.
 */
export type CspMode = "enforce" | "report-only" | "off";

export function parseCspMode(raw: string | undefined): CspMode {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "enforce" || v === "off") return v;
  return "report-only";
}

function originsForStorage(s3Endpoint: string | undefined): string[] {
  if (!s3Endpoint) return [];
  try {
    const url = new URL(s3Endpoint);
    const out = [url.origin];
    if (url.protocol === "https:") out.push(`https://*.${url.host}`);
    return out;
  } catch {
    return [];
  }
}

export function buildContentSecurityPolicy(opts: {
  s3Endpoint?: string | undefined;
  production: boolean;
  reportUri?: string | undefined;
}): string {
  const connect = ["'self'", ...originsForStorage(opts.s3Endpoint)];
  const directives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    `connect-src ${connect.join(" ")}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ];
  if (opts.production) directives.push("upgrade-insecure-requests");
  if (opts.reportUri) directives.push(`report-uri ${opts.reportUri}`);
  return directives.join("; ");
}

/** HSTS only where it is meaningful: production, and the request really was HTTPS. */
export function hstsValue(opts: { production: boolean; https: boolean }): string | null {
  return opts.production && opts.https ? "max-age=31536000; includeSubDomains" : null;
}

export function cspHeaderName(mode: CspMode): string | null {
  if (mode === "off") return null;
  return mode === "enforce" ? "content-security-policy" : "content-security-policy-report-only";
}
