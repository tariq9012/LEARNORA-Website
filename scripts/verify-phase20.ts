/**
 * Phase 20 verification: production hardening. Local only; refuses any database
 * not ending in "_test". Needs a built app (`npm run build:app`) for part E and
 * a git checkout for part D (skipped, and reported, without .git).
 *
 *   DATABASE_URL=postgresql://.../learnora_p20_test SESSION_SECRET=... npx tsx scripts/verify-phase20.ts
 *
 * A: database-backed rate limiter (multi-process race, window reset, hashing,
 *    fallback, purge, 429 mapping)  B: logging redaction + error hiding
 * C: CSP/HSTS builders  D: production env validation  E: git tracking
 * F: built app over HTTP (headers, CSP report endpoint, health, auth negatives)
 * NOT a real Vercel / Neon / R2 / browser test.
 */
import { execFile, execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// ------------------------------------------------------------------ child mode
if (process.argv[2] === "rl-child") {
  const [, , , key, limitS, countS, windowS] = process.argv;
  const { enforceRateLimit } = await import("../src/server/auth/rate-limit");
  let allowed = 0;
  let blocked = 0;
  let other = 0;
  for (let i = 0; i < Number(countS); i++) {
    try {
      await enforceRateLimit(key!, Number(limitS), Number(windowS));
      allowed++;
    } catch (e) {
      if ((e as Error).name === "RateLimitExceededError") blocked++;
      else other++;
    }
  }
  console.log(JSON.stringify({ allowed, blocked, other }));
  process.exit(0);
}

const dbName = new URL(process.env["DATABASE_URL"] ?? "postgresql://x/none").pathname.slice(1);
if (!dbName.endsWith("_test")) {
  console.error(`Refusing to run: database "${dbName}" does not end with "_test".`);
  process.exit(2);
}

let passed = 0;
let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name} ${detail}`);
  }
};
const section = (t: string) => console.log(`\n== ${t}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function runChild(key: string, limit: number, count: number, windowMs: number, env = {}) {
  const { stdout } = await execFileAsync(
    "npx",
    [
      "tsx",
      "scripts/verify-phase20.ts",
      "rl-child",
      key,
      String(limit),
      String(count),
      String(windowMs),
    ],
    { env: { ...process.env, ...env }, timeout: 120_000 },
  );
  return JSON.parse(stdout.trim().split("\n").pop()!) as {
    allowed: number;
    blocked: number;
    other: number;
  };
}

const GOOD_PROD_ENV = {
  DATABASE_URL:
    "postgresql://user:DBPASS-SENTINEL-77@db.example.neon.tech/learnora?sslmode=require",
  SESSION_SECRET: "prod-session-secret-SENTINEL-0123456789abcdef",
  NODE_ENV: "production",
  APP_URL: "https://learnora.test.example",
  STORAGE_PROVIDER: "s3",
  S3_ENDPOINT: "https://acct123.r2.cloudflarestorage.com",
  S3_BUCKET: "learnora-bucket",
  S3_ACCESS_KEY_ID: "AKIDTEST",
  S3_SECRET_ACCESS_KEY: "R2SECRET-SENTINEL-99",
  EMAIL_PROVIDER: "gmail",
  GMAIL_USER: "someone@gmail.com",
  GMAIL_PASS: "qwertyuiopasdfgh",
};

async function main() {
  // =============================================================== A. rate limiter
  section("A. database-backed rate limiter");
  const { prisma } = await import("../src/server/db/client");
  const { enforceRateLimit, RateLimitExceededError, purgeExpiredRateLimitBuckets } =
    await import("../src/server/auth/rate-limit");
  await prisma.$executeRaw`DELETE FROM rate_limit_buckets`;

  const results = await Promise.all(
    [1, 2, 3, 4].map(() => runChild("p20:race:alice@example.com", 25, 20, 60_000)),
  );
  const allowed = results.reduce((n, r) => n + r.allowed, 0);
  const blocked = results.reduce((n, r) => n + r.blocked, 0);
  check(
    "4 separate processes share ONE budget: exactly 25 of 80 hits allowed",
    allowed === 25,
    `allowed=${allowed}`,
  );
  check(
    "the other 55 hits are blocked, none failed otherwise",
    blocked === 55 && results.every((r) => r.other === 0),
    `blocked=${blocked}`,
  );

  const rows = await prisma.$queryRaw<Array<{ key: string }>>`SELECT "key" FROM rate_limit_buckets`;
  check(
    "stored keys are 64-char hashes; the raw email/prefix is never stored",
    rows.length > 0 && rows.every((r) => /^[0-9a-f]{64}$/.test(r.key)),
  );

  const first = await runChild("p20:reset", 1, 2, 1500);
  check("limit 1: second hit in the window is blocked", first.allowed === 1 && first.blocked === 1);
  await sleep(1700);
  const after = await runChild("p20:reset", 1, 1, 1500);
  check("window expiry: allowed again after the window passes", after.allowed === 1);

  let err: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      await enforceRateLimit("p20:retry", 2, 30_000);
    } catch (e) {
      err = e;
    }
  }
  check(
    "blocked error carries a sane Retry-After (1..30s)",
    err instanceof RateLimitExceededError &&
      err.retryAfterSeconds >= 1 &&
      err.retryAfterSeconds <= 30,
  );

  const unreachable = await runChild("p20:fallback", 2, 5, 60_000, {
    DATABASE_URL: "postgresql://nobody:nopass@127.0.0.1:1/p20_test",
  });
  check(
    "database unreachable -> falls back to per-instance limiting, never crashes",
    unreachable.allowed === 2 && unreachable.blocked === 3 && unreachable.other === 0,
    JSON.stringify(unreachable),
  );

  await prisma.$executeRaw`DELETE FROM rate_limit_buckets`;
  await prisma.$executeRaw`INSERT INTO rate_limit_buckets ("key","count","reset_at") VALUES
    ('old',1, now() - interval '2 hours'), ('recent',1, now() - interval '10 minutes'), ('live',1, now() + interval '1 hour')`;
  const purged = await purgeExpiredRateLimitBuckets();
  const left = (
    await prisma.$queryRaw<Array<{ key: string }>>`SELECT "key" FROM rate_limit_buckets`
  )
    .map((r) => r.key)
    .sort();
  check(
    "purge removes only buckets expired > 1h ago",
    purged === 1 && left.join() === "live,recent",
    `purged=${purged} left=${left}`,
  );

  // limits wired into real services (AVATAR intent needs no instructor)
  const { createUploadIntent } = await import("../src/server/media/direct-upload-service");
  const { toSafeUser } = await import("../src/server/auth/types");
  const student = await prisma.user.findFirstOrThrow({ where: { role: "STUDENT" } });
  const safe = toSafeUser(student as never);
  await prisma.$executeRaw`DELETE FROM rate_limit_buckets`;
  let ok = 0;
  let limited: unknown;
  for (let i = 0; i < 102; i++) {
    try {
      await createUploadIntent(safe, {
        purpose: "AVATAR",
        filename: "a.png",
        mimeType: "image/png",
        sizeBytes: 1000,
      });
      ok++;
    } catch (e) {
      limited = e;
    }
  }
  check(
    "upload-intent creation is limited per user (100 / 10 min)",
    ok === 100 && limited instanceof RateLimitExceededError,
    `ok=${ok}`,
  );

  const { mediaErrorResponse } = await import("../src/server/media/media-http");
  const r429 = mediaErrorResponse(new RateLimitExceededError(undefined, 42));
  check(
    "media routes answer 429 with Retry-After",
    r429.status === 429 && r429.headers.get("retry-after") === "42",
  );

  // ======================================================= B. logging + error hiding
  section("B. logging redaction and error hiding");
  const { scrub, safeErrorInfo } = await import("../src/server/lib/log");
  check(
    "scrub hides postgres URLs",
    !scrub("fail postgresql://u:PW123@h/db now").includes("PW123"),
  );
  check(
    "scrub hides presigned signatures",
    !scrub("https://x/y?X-Amz-Signature=abcdef123&X-Amz-Credential=KEY").includes("abcdef123"),
  );
  check(
    "scrub hides bearer tokens",
    !scrub("Authorization: Bearer abc.def.ghi").includes("abc.def"),
  );
  check(
    "scrub hides token= / password= params",
    !/hunter2|tok123/.test(scrub("a?token=tok123&password=hunter2")),
  );
  const info = JSON.stringify(
    safeErrorInfo(new Error("connect postgresql://u:LEAKME@h/db failed")),
  );
  check(
    "error logs never include the error message (could echo secrets)",
    !info.includes("LEAKME") && !info.includes("failed"),
  );

  const captured: string[] = [];
  const realError = console.error;
  console.error = (...a: unknown[]) => void captured.push(a.map(String).join(" "));
  const res500 = mediaErrorResponse(
    new Error("password authentication failed for postgresql://u:SECRETPW@h/db"),
  );
  console.error = realError;
  const body500 = await res500.text();
  check(
    "unexpected error -> generic 500 body (no details to the client)",
    res500.status === 500 && !/SECRETPW|postgres|password/i.test(body500),
  );
  check(
    "...and the server log line has no secret either",
    captured.length > 0 && !captured.join("\n").includes("SECRETPW"),
  );

  const { sanitizeInternalPath } = await import("../src/lib/safe-path");
  const evil = [
    "//evil.example",
    "https://evil.example/x",
    "/\\evil.example",
    "javascript:alert(1)",
    "///evil.example",
  ];
  check(
    "unsafe redirects rejected",
    evil.every((p) => sanitizeInternalPath(p) === null),
  );
  check("safe internal redirect kept", sanitizeInternalPath("/dashboard") === "/dashboard");

  // ================================================================ C. CSP / HSTS
  section("C. CSP / HSTS builders");
  const sec = await import("../src/server/lib/security-headers");
  const csp = sec.buildContentSecurityPolicy({
    s3Endpoint: "https://acct123.r2.cloudflarestorage.com",
    production: true,
    reportUri: "/api/csp-report",
  });
  check("CSP has no unsafe-eval", !csp.includes("unsafe-eval"));
  check(
    "CSP blocks framing, plugins and base-tag injection",
    /frame-ancestors 'none'/.test(csp) &&
      /object-src 'none'/.test(csp) &&
      /base-uri 'self'/.test(csp),
  );
  check(
    "CSP allows direct R2 uploads (connect-src) from S3_ENDPOINT only",
    /connect-src 'self' https:\/\/acct123\.r2\.cloudflarestorage\.com https:\/\/\*\.acct123\.r2\.cloudflarestorage\.com/.test(
      csp,
    ) && !/connect-src[^;]*\*[ ;]/.test(csp.replace(/https:\/\/\*\.[^ ;]+/g, "")),
  );
  check(
    "CSP does not allow any third-party script host",
    /script-src 'self' 'unsafe-inline'(;|$)/.test(
      csp.split("; ").find((d) => d.startsWith("script-src")) ?? "",
    ),
  );
  check(
    "upgrade-insecure-requests only in production",
    csp.includes("upgrade-insecure-requests") &&
      !sec.buildContentSecurityPolicy({ production: false }).includes("upgrade-insecure-requests"),
  );
  check(
    "default CSP mode is report-only (never silently enforcing)",
    sec.parseCspMode(undefined) === "report-only" && sec.parseCspMode("garbage") === "report-only",
  );
  check(
    "enforce/off are honoured",
    sec.parseCspMode("enforce") === "enforce" && sec.cspHeaderName("off") === null,
  );
  check(
    "HSTS only for production AND https",
    sec.hstsValue({ production: true, https: true }) !== null &&
      sec.hstsValue({ production: true, https: false }) === null &&
      sec.hstsValue({ production: false, https: true }) === null,
  );

  // =========================================================== D. env validation
  section("D. production environment validation");
  const { parseServerEnv } = await import("../src/server/env");
  const tryParse = (over: Record<string, string | undefined>) => {
    try {
      parseServerEnv({ ...GOOD_PROD_ENV, ...over });
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  };
  check("a complete production config is accepted", tryParse({}) === null);
  const bad: Array<[string, Record<string, string | undefined>]> = [
    ["APP_URL over http", { APP_URL: "http://learnora.test.example" }],
    ["APP_URL missing", { APP_URL: undefined }],
    ["local storage (no override)", { STORAGE_PROVIDER: "local" }],
    ["console email provider", { EMAIL_PROVIDER: "console" }],
    ["gmail without app password", { GMAIL_PASS: undefined }],
    [
      "gmail with a normal account password (not an app password)",
      { GMAIL_PASS: "My-Real-Password-123!" },
    ],
    ["s3 without secret key", { S3_SECRET_ACCESS_KEY: undefined }],
    ["short SESSION_SECRET", { SESSION_SECRET: "short" }],
    ["non-postgres DATABASE_URL", { DATABASE_URL: "mysql://u:p@h/db" }],
    ["unknown payment provider (no real payments)", { PAYMENT_PROVIDER: "stripe" }],
    ["revenue share > 100", { INSTRUCTOR_REVENUE_SHARE_PERCENT: "150" }],
    ["minimum payout 0", { MINIMUM_PAYOUT_AMOUNT: "0" }],
    ["invalid CSP_MODE", { CSP_MODE: "maybe" }],
  ];
  for (const [label, over] of bad) check(`rejects: ${label}`, tryParse(over) !== null);
  const combined = tryParse({ APP_URL: "http://x.example", PAYMENT_PROVIDER: "stripe" }) ?? "";
  check(
    "validation errors never print secret values",
    !/DBPASS-SENTINEL|R2SECRET-SENTINEL|qwertyuiopasdfgh|prod-session-secret-SENTINEL/.test(
      combined,
    ) && combined.length > 0,
  );

  // ============================================================== E. git tracking
  section("E. git tracking of production source");
  if (!existsSync(".git")) {
    console.log("  (no .git folder here: part E skipped, run it from your git checkout)");
  } else {
    const git = (...a: string[]) => {
      try {
        return execFileSync("git", a, { encoding: "utf8" });
      } catch (e) {
        return (e as { stdout?: string }).stdout ?? "";
      }
    };
    check(
      "no TRACKED file matches an ignore rule",
      git("ls-files", "-ci", "--exclude-standard").trim() === "",
      git("ls-files", "-ci", "--exclude-standard"),
    );
    for (const p of [
      "src/server/storage/new-provider.ts",
      "src/lib/logs/x.ts",
      "src/server/dist/x.ts",
      "src/server/auth/x.ts",
      "prisma/migrations/20990101000000_x/migration.sql",
    ]) {
      check(`new source file would NOT be ignored: ${p}`, git("check-ignore", p).trim() === "");
    }
    for (const p of [
      ".env",
      ".env.local",
      "node_modules/x",
      ".output/x",
      "storage/uploads/a.png",
      ".vercel/x",
    ]) {
      check(`still ignored: ${p}`, git("check-ignore", p).trim() !== "");
    }
    const tracked = new Set(git("ls-files").split("\n"));
    for (const p of [
      "src/server/storage/s3-storage-provider.ts",
      "src/server/storage/index.ts",
      "src/server/lib/security-headers.ts",
      "src/server/lib/log.ts",
      "src/routes/api.csp-report.ts",
      "src/routes/api.cron.cleanup-uploads.ts",
      ".env.example",
    ]) {
      const untrackedButPresent = existsSync(p) && !tracked.has(p);
      check(
        `present and trackable (add to git if untracked): ${p}`,
        existsSync(p) && git("check-ignore", p).trim() === "",
        untrackedButPresent ? "(file exists but is not yet `git add`ed)" : "",
      );
    }
    check(".env is not tracked", !tracked.has(".env"));
  }

  // ======================================================== F. built app over HTTP
  section("F. built app over HTTP");
  if (!existsSync(".output/server/index.mjs")) {
    console.log("  (no build found: run `npm run build:app` first; part F skipped)");
  } else {
    const apps: ChildProcess[] = [];
    const start = (port: number, env: Record<string, string>) => {
      const c = spawn("node", [".output/server/index.mjs"], {
        env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", ...env },
        stdio: "ignore",
      });
      apps.push(c);
      return c;
    };
    const ready = async (port: number) => {
      for (let i = 0; i < 60; i++) {
        try {
          if ((await fetch(`http://127.0.0.1:${port}/api/health`)).status < 500) return true;
        } catch {
          /* starting */
        }
        await sleep(500);
      }
      return false;
    };
    const prodEnv = (port: number, extra: Record<string, string> = {}) => ({
      ...GOOD_PROD_ENV,
      DATABASE_URL: process.env["DATABASE_URL"]!,
      SESSION_SECRET: process.env["SESSION_SECRET"]!,
      APP_URL: `https://learnora.test.example`,
      ...extra,
      PORT: String(port),
    });
    try {
      start(3211, prodEnv(3211));
      start(3212, prodEnv(3212, { CSP_MODE: "enforce" }));
      start(3213, {
        NODE_ENV: "test",
        DATABASE_URL: process.env["DATABASE_URL"]!,
        SESSION_SECRET: process.env["SESSION_SECRET"]!,
      });
      start(
        3214,
        prodEnv(3214, { DATABASE_URL: "postgresql://nobody:DBLEAK-77@127.0.0.1:1/p20_test" }),
      );
      const up = await Promise.all([3211, 3212, 3213, 3214].map(ready));
      check("all four test instances started", up.every(Boolean), JSON.stringify(up));

      const h = async (port: number, path: string, init: RequestInit = {}) =>
        fetch(`http://127.0.0.1:${port}${path}`, { redirect: "manual", ...init });
      const fwd = { "x-forwarded-proto": "https" };

      const page = await h(3211, "/", { headers: fwd });
      const html = await page.text();
      check("home page renders", page.status === 200 && html.includes("</html>"));
      check(
        "CSP (report-only by default) is on HTML pages",
        !!page.headers.get("content-security-policy-report-only") &&
          !page.headers.get("content-security-policy"),
      );
      check(
        "CSP reporting points at /api/csp-report",
        (page.headers.get("content-security-policy-report-only") ?? "").includes(
          "report-uri /api/csp-report",
        ),
      );
      check(
        "CSP connect-src carries the R2 origin from S3_ENDPOINT",
        (page.headers.get("content-security-policy-report-only") ?? "").includes(
          "https://acct123.r2.cloudflarestorage.com",
        ),
      );
      check(
        "CSP has no unsafe-eval on a real response",
        !(page.headers.get("content-security-policy-report-only") ?? "").includes("unsafe-eval"),
      );
      const enforced = await h(3212, "/", { headers: fwd });
      check(
        "CSP_MODE=enforce sends an enforced CSP",
        !!enforced.headers.get("content-security-policy") &&
          !enforced.headers.get("content-security-policy-report-only"),
      );
      check(
        "HSTS sent in production over https",
        (page.headers.get("strict-transport-security") ?? "").includes("max-age=31536000"),
      );
      const notHttps = await h(3211, "/", { headers: { "x-forwarded-proto": "http" } });
      check(
        "no HSTS when the request was not https",
        !notHttps.headers.get("strict-transport-security"),
      );

      const dev = await h(3213, "/", { headers: fwd });
      check("non-production: no HSTS", !dev.headers.get("strict-transport-security"));

      const baseline = [
        "x-content-type-options",
        "referrer-policy",
        "x-frame-options",
        "permissions-policy",
      ];
      for (const [label, path] of [
        ["page", "/"],
        ["JSON API", "/api/health"],
        ["404 page", "/definitely-not-a-page-xyz"],
      ] as const) {
        const r = await h(3211, path, { headers: fwd });
        check(
          `baseline security headers on ${label}`,
          baseline.every((n) => !!r.headers.get(n)),
          `status=${r.status}`,
        );
      }
      check(
        "nosniff + frame protection values",
        page.headers.get("x-content-type-options") === "nosniff" &&
          page.headers.get("x-frame-options") === "DENY",
      );

      const rep = (body: string, type = "application/csp-report") =>
        h(3211, "/api/csp-report", { method: "POST", headers: { "content-type": type }, body });
      const okRep = await rep(
        JSON.stringify({
          "csp-report": {
            "document-uri": "https://x/y?token=abc",
            "blocked-uri": "https://evil.example/a.js?k=1",
            "effective-directive": "script-src",
          },
        }),
      );
      check("csp-report: valid report -> 204", okRep.status === 204);
      check(
        "csp-report: garbage -> 204 (never an error oracle)",
        (await rep("not json")).status === 204,
      );
      check("csp-report: oversized body -> 204", (await rep("x".repeat(20_000))).status === 204);
      check("csp-report: GET is not accepted", (await h(3211, "/api/csp-report")).status !== 204);

      const health = await h(3211, "/api/health");
      check("liveness /api/health -> 200", health.status === 200);
      const readyRes = await h(3211, "/api/ready");
      check(
        "readiness /api/ready -> 200 with database ok",
        readyRes.status === 200 && (await readyRes.text()).includes('"database":"ok"'),
      );
      const bad = await h(3214, "/api/ready");
      const badBody = await bad.text();
      check(
        "readiness with unreachable DB -> 503",
        bad.status === 503 && badBody.includes('"database":"fail"'),
      );
      check(
        "readiness failure leaks no URL/password/host",
        !/DBLEAK|postgres|127\.0\.0\.1|nobody/i.test(badBody),
      );
      check(
        "liveness stays 200 while the database is down",
        (await h(3214, "/api/health")).status === 200,
      );

      const noAuth = await h(3211, "/api/media/upload-intent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          purpose: "AVATAR",
          filename: "a.png",
          mimeType: "image/png",
          sizeBytes: 10,
        }),
      });
      check("upload-intent without a session -> 401", noAuth.status === 401);
      const noAuthFin = await h(3211, "/api/media/upload-finalize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ intentId: "x" }),
      });
      check("upload-finalize without a session -> 401", noAuthFin.status === 401);
      const cron = await h(3211, "/api/cron/cleanup-uploads");
      check("cron cleanup without CRON_SECRET configured -> 503", cron.status === 503);
      const evilSession = await h(3211, "/api/media/upload-intent", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "learnora_session=forged-token-value",
        },
        body: "{}",
      });
      check("forged session cookie is rejected", evilSession.status === 401);
    } finally {
      for (const a of apps) a.kill("SIGTERM");
    }
  }

  await prisma.$executeRaw`DELETE FROM rate_limit_buckets`;
  await prisma.$disconnect();
  console.log(`\nPhase 20 verification: ${passed} passed, ${failed} failed.`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
