import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { log } from "./server/lib/log";
import {
  buildContentSecurityPolicy,
  cspHeaderName,
  hstsValue,
  parseCspMode,
} from "./server/lib/security-headers";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

// Baseline security headers for every dynamic response (pages, API, raw media
// routes AND error responses). The same four are also configured as Nitro
// routeRules in vite.config.ts, which is what covers static assets. A header a
// handler already set is never overwritten. CSP/HSTS are deliberately not set
// here but in applyExtraHeaders below (Phase 20) — see DEPLOYMENT.md.
const SECURITY_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
};

// Vite replaces a literal `process.env.NODE_ENV` with its BUILD-time value in the
// server bundle, so reading it directly here would always say "production" in a
// built app. Going through an alias keeps this a true runtime check.
const runtimeEnv: Record<string, string | undefined> = process.env;

function applyExtraHeaders(response: Response, request: Request): Response {
  const extra: Array<[string, string]> = [];
  const production = runtimeEnv["NODE_ENV"] === "production";
  const proto =
    request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  const hsts = hstsValue({ production, https: proto === "https" });
  if (hsts && !response.headers.has("strict-transport-security")) {
    extra.push(["strict-transport-security", hsts]);
  }
  const cspName = cspHeaderName(parseCspMode(process.env["CSP_MODE"]));
  const isHtml = (response.headers.get("content-type") ?? "").toLowerCase().includes("text/html");
  if (cspName && isHtml && !response.headers.has(cspName)) {
    extra.push([
      cspName,
      buildContentSecurityPolicy({
        s3Endpoint: process.env["S3_ENDPOINT"],
        production,
        reportUri: "/api/csp-report",
      }),
    ]);
  }
  return setHeaders(response, extra);
}

function setHeaders(response: Response, entries: Array<[string, string]>): Response {
  if (entries.length === 0) return response;
  try {
    for (const [name, value] of entries) response.headers.set(name, value);
    return response;
  } catch {
    // Some Response objects (e.g. from fetch/redirect helpers) have immutable
    // headers: rebuild around the same body instead of dropping the headers.
    const headers = new Headers(response.headers);
    for (const [name, value] of entries) headers.set(name, value);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
}

function withSecurityHeaders(response: Response, request: Request): Response {
  const missing = Object.entries(SECURITY_HEADERS).filter(([name]) => !response.headers.has(name));
  return applyExtraHeaders(setHeaders(response, missing), request);
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return withSecurityHeaders(await normalizeCatastrophicSsrResponse(response), request);
    } catch (error) {
      log.error("server.unhandled_error", error);
      return withSecurityHeaders(
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
        request,
      );
    }
  },
};
