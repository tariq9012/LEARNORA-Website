# Learnora — Phase 20 Report: Production Hardening, Observability, Performance & Release Audit

Labels: `EXECUTED PASS`, `EXECUTED FAIL`, `CODE REVIEW ONLY`, `NOT TESTED`, `BLOCKED`, `NOT AUDITED`.
In sections 1-17, everything marked EXECUTED ran **locally** (PostgreSQL 16 `_test` databases, fake S3 `s3rver`, the built app on localhost). The sections below up to 17 describe what I could run locally. **Section 18 records the live production verification you performed afterwards (2026-10-09)** and the scorecard in section 16 has been updated with it.

**Base:** the code was audited and changed starting from your GitHub repo (`tariq9012/LEARNORA-Website`, latest commit `8216f84 Add S3 storage provider`), not from the earlier zip. It already contained the TanStack repair and your new favicon files; I did not touch those.

---

## 1. Baseline audit (what was found)

| #   | Severity     | Finding                                                                                                                                                                                                                                                  | Status                                                                                       |
| --- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1   | **High**     | **Root cause of the missing `s3-storage-provider.ts`:** `.gitignore` had an unanchored `storage/`, matching `src/server/storage/`. The 4 files there are tracked only because they were committed first; **any new file in that folder is silently ignored**. `logs` and `dist` had the same flaw. | **Fixed** (anchored to repo root). Verified by `git check-ignore`; 20 git-tracking checks in verify-phase20. |
| 2   | **High**     | Rate limiter was a per-instance in-memory `Map`: on Vercel an attacker gets a fresh budget on every instance, so brute-force protection was weak. Upload intent/finalize, checkout, payment confirm and reviews had **no** limit.                         | **Fixed**: shared PostgreSQL-backed limiter + new limits (section 4).                        |
| 3   | Medium       | No Content-Security-Policy and no HSTS.                                                                                                                                                                                                                  | **Added**, CSP in **report-only** by default (section 3). Not browser-tested.                |
| 4   | Medium       | `package-lock.json` in the repo is out of sync with `package.json`: `npm ci` fails (`ajv`).                                                                                                                                                              | **Fixed**: re-synced; only `ajv` and `json-schema-traverse` re-nested, no other version moved. |
| 5   | Medium       | Raw media routes returned a generic 500 for a rate-limit rejection (no 429), and logged raw error objects (ORM/driver messages can echo query data).                                                                                                      | **Fixed**: 429 + `Retry-After`; errors now log name/code/2 frames only.                      |
| 6   | Medium       | Vite bakes `process.env.NODE_ENV` into the server bundle at build time. My first header code therefore treated a `NODE_ENV=test` run as production (found by my own test).                                                                                | **Fixed** (runtime read through an alias).                                                   |
| 7   | Low          | `lint` failed with 74 Prettier errors in the repo (`src/data/mock.ts`, unused; `__root.tsx` missing newline).                                                                                                                                            | **Fixed** (formatting only). `mock.ts` is imported nowhere; I did not delete it.             |
| 8   | Info         | 21 repository `findMany` calls have no `take`/cursor (list below).                                                                                                                                                                                       | **Deferred**, no measured problem.                                                           |
| 9   | Info         | `tsc --noEmit`: 11 errors in the clean repo, 11 after Phase 20 (0 added). One is in `__root.tsx` (newer TanStack error-component types).                                                                                                                 | **Deferred**, pre-existing. `vite build` does not typecheck.                                 |

Checked and already in good shape (evidence = code review plus existing suites): reset-password revokes **all** sessions (`revokeAllSessionsForUser`); password change revokes all **other** sessions; a session of a non-`ACTIVE` (suspended/banned) user is rejected and revoked on use; admin user DTO is an explicit allow-list (no hashes/tokens/sessions); Phase 15 `sanitizeInternalPath` rejects `//host`, `https://…`, `/\host`, `javascript:` (re-tested); raw media POST routes require session **and** CSRF (re-tested over HTTP: Phase 18 HTTP suite 72/72); demo seed refuses non-local DBs; `/api/health` (alive) and `/api/ready` (DB reachable) exist and leak nothing.

Unbounded `findMany` candidates (not changed): `asset-repository:96`, `category-repository:5`, `certificate-repository:24`, `course-section-repository:4`, `enrollment-repository:61,195`, `instructor-course-repository:11`, `instructor-earning-repository:58,70,98,140`, `instructor-repository:19,37,93,145,162`, `order-repository:65`, `payment-repository:65`, `review-repository:22`, `session-repository:41`, `wishlist-repository:23`. Most are scoped to one user/course/instructor; the ones most likely to grow are per-instructor earnings lists and per-student orders/learning. Worth bounding only if you see slow pages.

## 2. Files changed

**New (5):** `prisma/migrations/20261006120000_rate_limit_buckets/migration.sql`, `scripts/verify-phase20.ts`, `src/routes/api.csp-report.ts`, `src/server/lib/log.ts`, `src/server/lib/security-headers.ts`, plus this report.

**Modified (22):** `.env.example`, `.gitignore`, `DEPLOYMENT.md`, `package.json`, `package-lock.json`, `prisma/schema.prisma`, `src/data/mock.ts` (format only), `src/routeTree.gen.ts` (generated), `src/routes/__root.tsx` (format only), `src/routes/api.cron.cleanup-uploads.ts`, `src/server.ts`, `src/server/auth/auth-service.ts`, `src/server/auth/rate-limit.ts`, `src/server/env.ts`, `src/server/media/direct-upload-service.ts`, `src/server/media/media-http.ts`, `src/server/services/account-security-service.ts`, `src/server/services/checkout-service.ts`, `src/server/services/messaging-service.ts`, `src/server/services/payment-service.ts`, `src/server/services/report-service.ts`, `src/server/services/review-service.ts`.

`package.json`: only a new script `verify:phase20`. No dependency was added, removed or upgraded.

## 3. Security changes

- **`.gitignore`** anchored (`/storage/`, `/logs`, `/dist`, `/dist-ssr`, `/.output`, `/.nitro`). `.env`, `.env.*`, `node_modules`, `.output`, `.vercel`, `src/generated`, root `storage/` are still ignored (tested).
- **Headers** (`src/server.ts`, `src/server/lib/security-headers.ts`). Already present and unchanged: `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy`. New: **HSTS** `max-age=31536000; includeSubDomains`, sent only in production **and** when the request was HTTPS. New: **CSP** on HTML responses, controlled by `CSP_MODE` = `report-only` (**default**) / `enforce` / `off`:
  `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' <R2 origin from S3_ENDPOINT>; worker-src 'self' blob:; manifest-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests (production); report-uri /api/csp-report`.
  - **Why report-only by default:** there is no browser in my environment, so I could not prove the enforced policy leaves the site, fonts, video and R2 uploads working. Shipping an untested enforced CSP risks breaking your live site. Promotion steps are in `DEPLOYMENT.md` section 12 (one environment variable, no code change).
  - **Real weakness, not hidden:** `script-src` needs `'unsafe-inline'` because TanStack Start streams inline bootstrap scripts into each page. CSP therefore will **not** block injected inline script. No `unsafe-eval`. Nonce-based CSP is future work.
- **`/api/csp-report`**: unauthenticated by necessity (browsers send reports without cookies), changes no state, 8 KB cap, per-IP rate limit, logs directive + origin only (no full URLs), always `204`.
- **Rate limiting**: see section 4.
- **Logging**: `src/server/lib/log.ts` (JSON lines; scrubs DB URLs, presigned `X-Amz-*` values, bearer tokens, `token=`/`password=`; errors reduced to name, code, two stack frames, never the message). Used in the cron, CSP report, limiter, media error handler and the top-level server error handler. Other older `console.*` calls elsewhere were not rewritten (no secret was found in them, but I did not audit every one).
- **Env**: `CSP_MODE` added and validated. Existing production validation already rejects: non-https/missing `APP_URL`, console email, local storage (and always on Vercel), gmail without a 16-letter app password, s3 without keys, dev placeholder/short `SESSION_SECRET`, non-postgres `DATABASE_URL`, unknown payment provider, revenue share outside 0-100, payout 0; error text never prints secret values (all re-tested, 12 negative cases with a verified-good baseline).
- `DIRECT_URL` is deliberately **not** validated at runtime: the app never reads it (only the Prisma CLI does).

## 4. Rate limiting (design and honest limits)

`src/server/auth/rate-limit.ts` now counts in **PostgreSQL** (new table `rate_limit_buckets`, one atomic `INSERT … ON CONFLICT DO UPDATE` per check). Keys are stored as HMAC-SHA256 (never raw emails/IPs). No new service or cost: it uses your existing Neon database.

Covered (shared across instances): login (per IP 20/15 min and per email 10/15 min), register 10/h/IP, forgot password 5/15 min/IP, reset password 10/h/IP, change password 5/15 min, messages and new conversations, reports, **new:** upload intent 100/10 min/user, upload finalize 200/10 min/user, checkout 30/10 min/user, payment confirm 30/10 min/user, reviews 30/h/user, CSP reports 30/min/IP.

Not covered: admin mutations (authenticated admin only; not abuse-prone from the outside). Honest limits: one small DB query per limited request; fixed windows (burst up to 2× at a boundary); per-email login limit lets someone lock a known email out for 15 minutes (existing design); if the database is unreachable it falls back to per-instance counting and logs `ratelimit.store_unavailable`; it trusts `x-forwarded-for`, which is correct behind Vercel but not behind an arbitrary proxy; it does **not** stop volumetric DDoS (use Vercel Firewall). A "login" brute force **over HTTP** (the TanStack server function) was not driven end to end; the limiter itself is proven at service and multi-process level.

The daily cron also purges limiter rows that expired more than an hour ago (bounded 1000/run).

## 5. Database

- **Migration added: yes, one, additive:** `20261006120000_rate_limit_buckets` (creates `rate_limit_buckets` + an index on `reset_at`; `schema.prisma` got the matching model). No existing migration was edited. **Executed on Neon: NOT TESTED** (you must run `npm run db:migrate:deploy`). Replayed locally: all 14 migrations apply cleanly in order on an empty PostgreSQL 16 (the suites rebuild a fresh DB from them each time).
- The new table is accessed with raw SQL, so it works even before `prisma generate` runs; the schema model keeps `migrate` drift-free.
- Pooled connection / serverless behaviour: **CODE REVIEW ONLY** (Prisma `pg` adapter, pooled `DATABASE_URL` for the app, `DIRECT_URL` for migrations only). Query counts, N+1, indexes and admin-analytics cost were **NOT AUDITED in depth**. No index was added: I found no measured query pattern that justified one.

## 6. R2 / direct upload

Re-verified by the existing suites on the new base: Phase 18 service suite 117/117 (+8 local mode), Phase 18 **HTTP** suite 72/72 against the built app with fake S3 (intent expiry, one-time/duplicate finalize, ownership, content type, size, key generation, bytes not passing through the app, CSRF). New in Phase 20: intent creation and finalize are rate limited; `429` handling on those routes; unauthenticated intent/finalize and a forged session cookie return 401 (tested over HTTP); the CSP's `connect-src` is derived from `S3_ENDPOINT` so direct PUTs are allowed to your R2 origin only. The bucket stays private (no public/r2.dev change). R2 secret never in client bundles (section 9). **Real R2 + real browser CORS + CSP interaction: NOT TESTED.**

## 7. Email

No code change. Re-verified by Phase 16 (81/81): reset token single-use/expiry, same neutral response for unknown accounts, link built from `APP_URL` (https enforced in production), HTML escaping, no token/URL logged in production, failure logs without address/token. `GMAIL_PASS` must look like a 16-letter app password (a normal password is rejected at startup; tested). Reset email is sent via `waitUntil` (Phase 19). **Real Gmail delivery from Vercel: NOT TESTED.**

## 8. Payments

Still simulated, `PAYMENT_PROVIDER` only accepts `simulated` (tested: `stripe` is rejected). New: checkout and payment-confirm are rate limited. Duplicate checkout (existing pending order is returned), already-resolved payment, refunds and earnings were exercised by the Phase 10/11 suites (104 + 120 checks). No double-refund/duplicate-payment code was changed.

## 9. Secret scan (evidence)

- Build with sentinel values for `DATABASE_URL`, `DIRECT_URL`, `SESSION_SECRET`, `S3_SECRET_ACCESS_KEY`, `GMAIL_PASS`, `CRON_SECRET`, `RESEND_API_KEY` (Vercel-preset build, 142 client files): **0** occurrences of any full sentinel value in the client **or** the server function output (read at runtime, not baked in), and **0** occurrences of the variable names in client files. (A looser match on the word "SENTINEL" hit React's own `REACT_MEMO_CACHE_SENTINEL`: false positive, checked.)
- Pattern scan of all tracked and new source/docs/scripts for Postgres URLs with passwords, AWS keys, Resend keys, private keys: nothing found (after excluding my own test sentinels).
- `.env` is ignored and not tracked (tested). No `.env` is in the delivered zip.
- **Not done:** scanning Git history (only a depth-50 clone) and the live deployed site's HTML.

## 10. Dependency audit

`npm ci` (after lockfile sync): EXECUTED PASS. `npm ls` of `@tanstack/react-start @tanstack/react-router @tanstack/router-core @tanstack/start-client-core @tanstack/start-server-core`: **exit 0, no invalid/missing/extraneous**, a single version of each (`react-router 1.170.41`, `react-start 1.168.60`, `router-core 1.171.34`, `start-client-core 1.170.34`, `start-server-core 1.169.39`). No TanStack package was changed.

`npm audit`: 8 findings (1 moderate, 7 high, **0 critical**), same as Phase 19, nothing new.
- **Production tree (4, all high):** `prisma` (CLI), `@prisma/config`, `deepmerge-ts`, `mysql2` (pulled in by the Prisma 7 CLI/config toolchain). The advisories are a DoS-by-deep-merge and a MySQL-protocol issue; this app uses PostgreSQL and these packages are **not in the built app**. The only offered fix is `prisma@6.19.3` (a major downgrade conflicting with Prisma 7), so I did not apply it. **Deferred**; re-check on the next Prisma 7 patch.
- **Dev-only (4):** `s3rver` (fake S3 for tests), `busboy`, `dicer`, `fast-xml-parser`. Never deployed.
- No audit finding touches Vite, pg, nodemailer, the AWS SDK or TanStack. `npm audit fix --force` was not run.

## 11. Performance (limited, honest)

Measured only what was cheap: built client JS is **805 KB raw / 232 KB gzip total**, largest chunk 347 KB (105 KB gzip), CSS 16 KB gzip, no shipped image over 300 KB. I did **not** profile pages, count queries, or run Lighthouse, and made **no performance changes**. Status: **NOT AUDITED in depth**; the unbounded-query list above is the main lead.

## 12. Observability status

Structured JSON logs with request ids on the cron, scrubbed secrets, event names you can search in Vercel Logs. **Not** observability: no alerts, dashboards, tracing, error aggregation or uptime monitoring. `/api/health` (alive) and `/api/ready` (DB) are the hooks for an uptime monitor. `console.error` in older code paths was not all replaced.

## 13. Verification commands and exact results (local)

| Check                                                        | Result                                                                                         |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `npm ci` (original repo lockfile)                            | EXECUTED FAIL (ajv out of sync)                                                                |
| `npm ci` (after sync) / `npm ls` TanStack set                | EXECUTED PASS / EXECUTED PASS (exit 0)                                                         |
| `npm run db:generate`                                        | **BLOCKED** (Prisma engine host returns 403 in my sandbox). Runs inside `npm run build` on Vercel. The generated client I used matches the schema except the new model (not needed: raw SQL). |
| `npm run build` (full)                                       | **BLOCKED** (same reason). Not claimed.                                                        |
| `npm run build:app` (node preset) and Vercel preset          | EXECUTED PASS; cron `/api/cron/cleanup-uploads` `17 3 * * *` present in `.vercel/output/config.json` |
| `npm run lint`                                               | EXECUTED PASS: 0 errors, 11 warnings (after fixing 74 pre-existing Prettier errors)            |
| `npx tsc --noEmit` (no npm script)                           | EXECUTED FAIL: 11 errors = identical to the clean repo; Phase 20 adds 0                        |
| **verify-phase20 (new)**                                     | **EXECUTED PASS 89/89**                                                                        |
| verify-phase10 / 11 / 12                                     | EXECUTED PASS 104 / 120 / 63                                                                   |
| verify-phase15 / 15-security / 16                            | EXECUTED PASS 73 / 35 / 81                                                                     |
| verify-phase18 (S3 mode / local mode)                        | EXECUTED PASS 117 / 8                                                                          |
| verify-phase18-http (built app + fake S3)                    | EXECUTED PASS 72/72                                                                            |
| verify-phase19 / verify-phase19-http                         | EXECUTED PASS 39 / 16                                                                          |
| verify-phase18-client (built app + fake S3)                  | EXECUTED PASS 26/26                                                                            |
| Phase 17                                                     | No verify script exists in the repo                                                            |

What verify-phase20 proves (negative tests included): 4 **separate processes** share one budget (exactly 25 of 80 hits allowed under a concurrent race); keys stored only as 64-char hashes; window expiry; sane `Retry-After`; DB unreachable -> falls back and never crashes; purge removes only buckets expired >1 h; upload-intent creation blocked after 100 (real service); 429 mapping; secrets scrubbed from logs and 500 bodies (a DB-URL-with-password error yields a generic body and a clean log line); unsafe redirects rejected; CSP builder (no `unsafe-eval`, framing/plugins/base blocked, R2 origin from endpoint only, upgrade-insecure only in production, default mode report-only); HSTS only production+https; production env: verified-good baseline accepted, 13 unsafe configs rejected, no secret echoed; git: no tracked file matches an ignore rule, new files in the formerly-ignored folders are not ignored, `.env`/`node_modules`/`.output`/`storage` still ignored; built app over HTTP: security headers on page/JSON/404, CSP report-only vs enforce, HSTS only when production+https, `/api/csp-report` (valid/garbage/oversized all 204, GET not accepted), `/api/health` 200, `/api/ready` 200 with DB and **503 with unreachable DB and no leak of URL/password/host**, liveness 200 while DB down, upload intent/finalize without session 401, forged cookie 401, cron without secret 503.

## 14. Not executed / needs manual production verification

Real Neon migration; real Vercel deploy and cron run; real R2 upload with the production origin; real Gmail delivery; **CSP in a real browser (then set `CSP_MODE=enforce`)**; HSTS on the live domain; login brute-force through the live server function; full browser smoke tests; query-count/index/performance audit; Git history secret scan.

## 15. Remaining production limitations

- CSP is report-only until you promote it, and even enforced it needs `'unsafe-inline'` for scripts (no XSS protection from CSP).
- Rate limiter: fixed windows, +1 DB query per limited request, per-instance fallback if DB down, not a DDoS shield.
- Payments and payouts simulated. Gmail (daily limits; sends as your account). No malware scanning of uploads. Live push off on Vercel (polling). Cleanup runs daily, 200 intents/run (Hobby limit).
- 8 npm audit findings, 4 in the production tree (Prisma CLI toolchain, not in the running app), downgrade-only fix not applied.
- 11 pre-existing TypeScript errors (one in `admin-course-review-service.ts` looks like a real shape mismatch, not traced).
- 21 unbounded list queries (above). `src/data/mock.ts` is unused dead code.
- Logs: Vercel retention only, no alerting.

---

## 16. Final release scorecard

| Area                  | Rating          | Evidence / why not PASS                                                                                                                                                             |
| --------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication        | **PASS** | Phases 15/16 suites, session revocation (code + suites); live login, logout and password reset round trip worked on production (live, user-reported for reset). |
| Authorization / RBAC  | **PASS** (local) | Phase 10/11/12/15-security suites; admin/instructor guards on routes tested over HTTP. Not a penetration test.                                                                       |
| CSRF                  | **PASS** (local) | Phase 18 HTTP suite (72) and Phase 15-security; media mutations without CSRF proof are rejected. Framework server functions rely on the framework middleware (code review only).    |
| IDOR                  | **PARTIAL**     | Covered by Phase 15-security (35) and per-feature suites, plus code review of order/payment/review ownership. I did not enumerate every object type or endpoint in this phase.      |
| Database              | **PARTIAL** | Migration chain replays cleanly; the additive migration was applied on production Neon (14 migrations, success) and `/api/ready` confirms the DB. Query counts, N+1, index review **not audited**. |
| R2 storage            | **PARTIAL** | Live uploads to the real private R2 bucket worked under the enforced CSP. Bucket privacy (no public/r2.dev access) was not re-verified in this phase. |
| Direct uploads        | **PASS** | Live on production, CSP enforced: thumbnail, preview video (59.7 MB), lesson video (59.7 MB), lesson resource and avatar uploads all completed; 117 + 72 + 26 local checks. Network-tab check of the PUT target was not captured. |
| Media playback        | **PARTIAL** | Live: a course video plays under the enforced CSP. Range seeking, and the logged-out / not-enrolled / refunded denial cases, were not tested live (covered by local Phase 18 suites only). |
| Email                 | **PASS** | Phase 16 suite (81) plus the live forgot-password round trip on production (email received, link works, user-reported; reuse of the link and the https link host were part of the checklist). |
| Payments              | **PASS** (simulated) | Phase 10/11 suites; live test purchase completed (status PAID, order reference shown); checkout shows "Test payment — no real money will be charged."; env rejects other providers. |
| Admin                 | **PARTIAL**     | Phase 11/12 suites pass; allow-list DTO and pagination seen in code; not every admin mutation re-audited, no browser run.                                                            |
| Performance           | **NOT TESTED**  | Only bundle sizes measured (805 KB / 232 KB gzip). No page profiling, no query audit.                                                                                                |
| Security headers      | **PARTIAL** | Live and **enforced** (`Content-Security-Policy`, HSTS, nosniff, frame deny, referrer, permissions policy all present on production; no CSP warnings across the flows tested). Still `partial` only because `script-src` needs `'unsafe-inline'` (CSP won't stop injected inline script). |
| Rate limiting         | **PARTIAL** | Shared DB limiter proven under a multi-process race; live login limit observed on production ("Too many attempts" after repeated failures). Fixed windows, per-instance fallback if DB is down, no DDoS protection; upload/checkout/review limits not exercised live. |
| Logging               | **PARTIAL** | Structured JSON logs confirmed in Vercel Logs (cron runs); only some call sites converted; no alerting/tracing. |
| Production environment | **PASS** | Validation rejects 13 unsafe configs and echoes no secrets; live `/api/ready` reports `config: ok, database: ok`. |
| Dependency security   | **PARTIAL**     | Tree valid, 0 critical, 4 prod-tree highs in the Prisma CLI toolchain (not in app), no non-breaking fix available.                                                                   |
| Build                 | **PASS** | `build:app` passes for both presets locally; the Phase 20 commit built and deployed on Vercel (live site serves the new code). Full `npm run build` could not run in my sandbox (Prisma engine download blocked) but ran on Vercel. |
| Lint                  | **PASS**        | 0 errors, 11 warnings (executed).                                                                                                                                                    |
| Regression tests      | **PASS** (local) | 13 suites, 0 failures (counts above); nothing run against production.                                                                            |

This is not a claim that Learnora is "100% secure". It is a hardened baseline with the gaps above listed explicitly.

---

## 17. How to roll this out (step by step)

1. Copy the changed files into your repo (or use the full zip). Run `git status`, `git add` **every** new file, and check `git ls-files -ci --exclude-standard` prints nothing.
2. Apply the one migration to Neon first (PowerShell, then clear the variables): see `DEPLOYMENT.md` section 12.
3. `git push`; let Vercel deploy. Nothing else is required: `CSP_MODE` defaults to report-only.
4. Open the live site with DevTools Console open and click through the main flows. No CSP warnings -> set `CSP_MODE=enforce` and redeploy.
5. Check Vercel -> Logs for `ratelimit.store_unavailable` (should be absent after step 2) and run the Cron Job once.
6. Run the smoke-test checklist in `DEPLOYMENT.md` section 8.

---

## 18. Live production verification (performed by you, 2026-10-09)

Site: `https://learnora-website.vercel.app`. Evidence = the outputs and screenshots you sent. Secrets and database URLs are intentionally not recorded here.

| Check | Evidence | Result |
| --- | --- | --- |
| Neon migration | `prisma migrate deploy`: 14 migrations found, `20261006120000_rate_limit_buckets` applied, "All migrations have been successfully applied" | **EXECUTED PASS** (real Neon) |
| Security headers | `curl -I`: CSP, HSTS (`max-age=31536000; includeSubDomains`), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`; CSP `connect-src` carries the R2 origin | **EXECUTED PASS** |
| CSP report-only phase | Console showed no CSP warnings while clicking through the main flows | **EXECUTED PASS** |
| CSP enforced | After `CSP_MODE=enforce` + redeploy, header name is `Content-Security-Policy` (not `-Report-Only`); flows below still worked | **EXECUTED PASS** |
| `/api/health` | `{"status":"ok"}` | **EXECUTED PASS** |
| `/api/ready` | `{"status":"ready","checks":{"config":"ok","database":"ok"}}` | **EXECUTED PASS** |
| Cron, no secret configured | 503 `cron_not_configured` (fails closed) | **EXECUTED PASS** |
| Cron, secret configured | Without token: 401 `unauthorized`. Vercel Cron Jobs "Run": GET 200, three runs visible in Logs, structured info lines, Error/Warning/Fatal filters = 0 | **EXECUTED PASS** |
| Login rate limit | Repeated failed logins for a fake email -> "Too many attempts. Please wait a moment and try again." | **EXECUTED PASS** |
| Direct upload, thumbnail | "Upload complete", enforced CSP, clean console | **EXECUTED PASS** |
| Direct upload, preview video | `0901.mp4` 59.7 MB complete | **EXECUTED PASS** |
| Direct upload, lesson video | same file, 59.7 MB complete | **EXECUTED PASS** |
| Lesson resource | resource added and listed | **EXECUTED PASS** |
| Avatar | instructor profile shows photo with Replace/Remove | **EXECUTED PASS** (display; upload itself not separately captured) |
| Video playback | course video plays (0:08 / 0:40) | **EXECUTED PASS** (Range seeking not checked) |
| Checkout / test payment | "Payment successful", status PAID, order reference shown | **EXECUTED PASS** |
| Forgot-password round trip | reported working end to end (email, link, new password) | **EXECUTED PASS** (user-reported, no screenshot) |

Still not tested live: Google/GitHub login buttons (if they are functional they should be tried once because of `form-action 'self'`), private-media denial cases (logged out / not enrolled / refunded), Range seeking, upload/checkout/review rate limits, `csp.violation` entries in Vercel Logs over time (check after a couple of weeks), Gmail daily-limit behaviour, Lighthouse/performance, query-count audit.

Observations: the only console message in every screenshot is Edge's own "Images loaded lazily and replaced with placeholders" intervention, which is not a CSP message. The password of the production database was pasted into a chat during rollout; you decided to keep it. Treat the chat history as sensitive and rotate the password if it is ever shared.
