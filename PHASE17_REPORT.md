# Phase 17 Report — Production Deployment & Hardening

No real deployment was performed. Nothing here claims Vercel, Neon, Cloudflare R2 or Gmail success.
Labels: EXECUTED PASS / EXECUTED FAIL / CODE REVIEW ONLY / NOT TESTED / BLOCKED.

## A. Summary

Audited the Phase 16 codebase and hardened it for a Vercel + Neon + R2 + email deployment without changing architecture or UI.

Changed:

1. `npm run build` now runs `prisma generate` first (the client in `src/generated` is gitignored, and Vercel caches dependencies).
2. `prisma.config.ts` no longer fails `prisma generate` when `DIRECT_URL` is unset (EXECUTED FAIL before, config now loads).
3. Demo seed refuses production / non-local databases unless `ALLOW_DEMO_SEED=true`.
4. New `npm run admin:create` (password from env var only, create-only, rejects demo passwords).
5. Security headers on all responses (dynamic via `src/server.ts`, static via Nitro route rules).
6. `STORAGE_PROVIDER=local` rejected on Vercel at startup.
7. `vite-tsconfig-paths` replaced by native `resolve.tsconfigPaths` (build output identical: 385 files, same sizes).
8. ESLint ignores generated Prisma code; one missing newline fixed (lint: 37 errors → 0).
9. Safe `npm audit fix` (3 patch-level transitive bumps).
10. `.env.example` classification, `DEPLOYMENT.md`, README section.

## B. Deployment architecture

Browser → Vercel (TanStack Start + Nitro: pages, server functions, auth, CSRF, media authorization) → Neon PostgreSQL (all data; migrations applied manually) → Cloudflare R2 (private bucket, bytes only) → Gmail/Resend (reset email; links built from `APP_URL` only).

## C. Environment variables (names only)

- **Required in production:** `DATABASE_URL`, `DIRECT_URL`, `SESSION_SECRET`, `APP_URL`, `STORAGE_PROVIDER=s3`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `EMAIL_PROVIDER` (+ `GMAIL_USER`, `GMAIL_PASS` or `RESEND_API_KEY`, `EMAIL_FROM`). `NODE_ENV` is set by Vercel.
- **Optional:** `PAYMENT_PROVIDER`, `INSTRUCTOR_REVENUE_SHARE_PERCENT`, `MINIMUM_PAYOUT_AMOUNT`, `EMAIL_FROM` (gmail), `LOCAL_STORAGE_ROOT`.
- **Development-only:** `EMAIL_PROVIDER=console`, `STORAGE_PROVIDER=local`, `ALLOW_LOCAL_STORAGE_IN_PRODUCTION`, `ALLOW_DEMO_SEED`.
- **One-off script variables (shell only):** `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD`.
- **Automatic:** `VERCEL`.
- No variable is read by client code (all env access is in `src/server/env.ts`, `prisma/`, `scripts/`).

## D–H. Procedures

Exact commands and click-paths for the database, Vercel, Neon, R2 and email are in `DEPLOYMENT.md` sections 4–7. Database commands: `npm run db:migrate:deploy` (manual, before each release that adds a migration); never `migrate reset` or `db push` on production.

## I. Security findings

| Severity | Finding | Status |
|---|---|---|
| HIGH | `prisma/seed.ts` had no production guard (would create an admin with a known password) | Fixed |
| HIGH | Vercel's ~4.5 MB request-body limit blocks video (500 MB), preview (100 MB), resource (50 MB) uploads, which are streamed through the server | Not fixed (needs direct-to-R2 uploads; architecture change). Documented |
| MEDIUM | No security headers at all | Fixed (4 headers). CSP deferred |
| MEDIUM | Prisma client not generated in build; `generate` required `DIRECT_URL` | Fixed |
| MEDIUM | Rate limiter is per-instance, not global | Limitation, documented |
| LOW | Migration `20260926100000` converts `reports.reason` text to enum; aborts atomically on non-enum legacy rows. Its header comment says "dropped and recreated" but the SQL does not drop. Old migration left unmodified as instructed | Documented |
| LOW | 10 pre-existing `tsc` errors in 9 files (no typecheck script; Vite does not typecheck) | Not changed; identical to baseline |
| INFO | With invalid production config, `/api/ready` returns the generic 500 page, not JSON `not_ready`. Safe (names variables only in logs), not changed | Observed |
| INFO | `getRequestIP({ xForwardedFor: true })` is used for rate limiting; safe only if the host overwrites client-supplied `X-Forwarded-For` (Vercel documents it does; not verified here) | Not verified |
| INFO | No secrets committed; no `.env` in archive | Clean |

## J. Dependency audit (8 remaining, 10 before)

Applied: `brace-expansion` (×2), `fast-uri` patch bumps. Remaining, none shipped in `.output`:

- `busboy@0.3.1`, `dicer`, `fast-xml-parser`: only under dev-only `s3rver` (test fake-S3). Production uses busboy 1.6.0 (npm's "direct" label is a name collision). Only fix is a breaking downgrade.
- `prisma`, `@prisma/config`, `deepmerge-ts`, `mysql2`: Prisma CLI / Nitro dev chain. The suggested "fix" downgrades Prisma to 6.x; not applied.

## K. Files created

`DEPLOYMENT.md`, `PHASE17_REPORT.md`, `scripts/create-admin.ts`

## L. Files modified

`.env.example`, `README.md`, `eslint.config.js`, `package.json`, `package-lock.json`, `prisma.config.ts`, `prisma/seed.ts`, `src/server.ts`, `src/server/env.ts`, `src/server/media/media-serve.ts` (newline only), `vite.config.ts`

## M. Files removed

None. (Packages `vite-tsconfig-paths`, `tsconfck`, `globrex` removed from dependencies.)

## N. Verification

| Check | Status |
|---|---|
| `npm install`, `npm run build:app` | EXECUTED PASS |
| `npm run build` (includes `prisma generate`) | BLOCKED here (sandbox cannot reach `binaries.prisma.sh`); config loads without `DIRECT_URL` (EXECUTED PASS) |
| `npm run db:generate` | BLOCKED (same). Bundled client matches schema (28 models, `S3` enum) |
| `npm run lint` | EXECUTED PASS (0 errors, 11 pre-existing warnings) |
| `tsc --noEmit` | EXECUTED FAIL, pre-existing: 10 errors, locations identical to baseline |
| 12 migrations on empty PostgreSQL 16 via `psql` | EXECUTED PASS (not via `prisma migrate deploy`) |
| `prisma migrate deploy`, schema drift check | BLOCKED / NOT TESTED |
| verify phase10 / 11 / 12 / 15 / 15-security / 16 | EXECUTED PASS: 104 / 120 / 63 / 73 / 35 / 86, 0 failed (local `_test` DB) |
| Seed guard: production → refuse; remote host → refuse; override passes guard; local dev seed works | EXECUTED PASS |
| `admin:create`: missing vars, demo/short password rejected; valid creates ADMIN; duplicate refused; password never printed | EXECUTED PASS |
| Production server: `/api/health` ok; `/api/ready` ok; DB down → 503 with no credential leak; bad config refuses and names variables only | EXECUTED PASS |
| CSRF on raw route (real session): no token 403, wrong 403, right token passes, DELETE same | EXECUTED PASS (one route, local) |
| STUDENT session on instructor upload route → 403 | EXECUTED PASS (one route) |
| CSRF on the other raw routes and server-function middleware | CODE REVIEW ONLY |
| RBAC across all 118 server functions (101 direct guards; 17 public/auth/self-guarded) | CODE REVIEW ONLY |
| Security headers on `/`, API, 401, 404, static | EXECUTED PASS |
| Server log contains no session token, Gmail pass, S3 secret, or session secret | EXECUTED PASS |
| Client bundle scan (131 files, secret names/URLs/server libs) | EXECUTED PASS |
| Session cookie flags (HttpOnly/Secure/SameSite) | CODE REVIEW ONLY |
| CSRF/Origin check behind Vercel's proxy host | NOT TESTED (verify at smoke test 3) |
| Neon, Vercel, R2, Gmail/Resend delivery | NOT TESTED |
| Browser regression (all roles) | NOT TESTED |
| CSP | NOT SHIPPED (needs runtime testing) |

## O. Known limitations

- Simulated payments only (checkout shows "Test payment — no real money will be charged", code review).
- Large uploads fail on Vercel (~4.5 MB body limit).
- Rate limiter and SSE broker are process-local; polling keeps messaging working with 20–30 s delay. Open SSE streams also occupy function time on Vercel.
- Demo seed accounts exist for local use; seed is now guarded.
- `KNOWN ISSUE — deferred media rendering investigation` (R2 CourseCard/thumbnail/video rendering; old LOCAL assets may be missing). Not investigated; R2 is not classified as broken.
- No CSP; no HSTS set by the app.
- 10 pre-existing type errors; 8 dev-only audit findings.

## P. Production readiness (by area)

| Area | State | Why |
|---|---|---|
| Database | Ready with limitation | Migrations apply on empty PG16; never run through Neon/`migrate deploy` |
| Authentication | Ready with limitation | Cookie flags code-reviewed only; behind-proxy check untested |
| Authorization | Ready with limitation | Strong server-side guards; code review plus 2 executed route checks |
| CSRF | Ready with limitation | Executed on one raw route; rest by code review |
| Storage | Needs remediation | Large uploads blocked by Vercel body limit; R2 itself untested against Cloudflare |
| Email | Needs configuration | Provider code tested with local SMTP/mocks; Gmail/Resend untested |
| Payments | Ready with limitation | Simulated by design |
| Realtime | Ready with limitation | Process-local; polling fallback works |
| Deployment | Needs configuration | Build verified locally; no real deploy; `build` generate step untested here |
| Secrets | Ready | No secrets in repo, logs, or client bundle |
| Observability | Ready with limitation | Health/ready present; logs safe; no external monitoring or global rate limiting |
