# Learnora — Phase 19 Report: Production Deployment & Infrastructure

Labels used: `EXECUTED PASS`, `EXECUTED FAIL`, `CODE REVIEW ONLY`, `NOT TESTED`, `BLOCKED`.
Nothing here was run against real Neon, real R2, real Gmail or real Vercel. Those are `NOT TESTED` until you do them (section K).

---

## A. Production architecture

```
Browser ──► Vercel (Learnora: TanStack Start + Nitro, Node 22) ──► Neon PostgreSQL (pooled DATABASE_URL)

Large uploads
Browser ─► Learnora "create upload intent" ─► signed PUT URL
Browser ─────────────────────────────────────► Cloudflare R2 (directly, bucket PRIVATE)
Browser ─► Learnora "finalize" (small request) ─► Asset row created

Private playback / downloads
Browser ─► Learnora authorized /media route (checks login + enrollment) ─► private R2 object (streamed, Range supported)

Email
Learnora server ─► Gmail SMTP (App Password)   [sent via waitUntil so Vercel does not cut it off]

Scheduled
Vercel Cron (daily) ─► GET /api/cron/cleanup-uploads (Bearer CRON_SECRET) ─► deletes abandoned, never-finalized uploads
```

Migrations are a manual step with the **direct** Neon URL (`npm run db:migrate:deploy`). The app never migrates on boot.

---

## B. Audit findings

| #   | Severity    | Finding                                                                                                                                                                                                                                   | Status                                                                                                    |
| --- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 1   | High        | Password-reset email was "fire and forget". On Vercel the function can be frozen after the response, so the email could be lost silently.                                                                                                 | **Fixed**: `runInBackground()` (uses `waitUntil`). Real Vercel behaviour: NOT TESTED.                     |
| 2   | Medium      | SSE: in-memory broker is per instance, and every open stream holds a function invocation.                                                                                                                                                 | **Changed**: off by default on Vercel (`REALTIME_SSE=auto`). Polling is unchanged and always on.          |
| 3   | Medium      | No scheduled cleanup of abandoned uploads (manual command only).                                                                                                                                                                          | **Fixed**: daily Vercel Cron + secured endpoint. Real Vercel run: NOT TESTED.                             |
| 4   | Medium      | Legacy `LOCAL` assets cannot work on Vercel (no persistent disk). They return a clean 404.                                                                                                                                                | **Tool added** (`media:migrate-local`, dry-run default). Whether you have LOCAL rows: you must check.     |
| 5   | Medium      | `npm ci` failed on the original lockfile (two optional WASM packages missing from it).                                                                                                                                                    | **Fixed** by re-syncing the lockfile; no dependency version changed. `npm ci` now exits 0.                |
| 6   | Medium      | `tsc --noEmit` reports 10 errors in 9 files (there is no typecheck script; `vite build` does not typecheck). One in `admin-course-review-service.ts` looks like a real type mismatch (`videoUrl`, `resourceCount` missing); not traced.   | **Deferred** (outside Phase 19). Phase 19 adds 0 new errors (checked: 10 before, 10 after).               |
| 7   | Low         | `.vercel` build output made ESLint hang.                                                                                                                                                                                                  | **Fixed** (ignored in eslint/prettier/git).                                                               |
| 8   | Info        | In-memory rate limiter is per instance, not global.                                                                                                                                                                                       | Documented limitation.                                                                                    |
| 9   | Info        | Production env validation refuses to start without public https `APP_URL`, a real email provider and `STORAGE_PROVIDER=s3`.                                                                                                                | Good. Observed when I first started the built app with `NODE_ENV=production` and incomplete config.      |
| 10  | Info        | Migrations apply cleanly in order; schema matches migrated DB for tables, columns, nullability and enum values.                                                                                                                           | EXECUTED PASS (see G). Indexes, defaults and foreign keys were **not** compared.                          |

Already good from earlier phases (code review): session cookie HttpOnly + Secure in production + SameSite=Lax; separate CSRF cookie/header on raw media mutations; demo seed refuses non-local databases; `admin:create` for the first admin; every `verify-*` script refuses a database not ending in `_test`; S3 mode forces direct uploads so Vercel's ~4.5 MB request limit does not apply; signed PUT signs only `content-type`, so the CORS rule below is exact.

---

## C. Files created

- `src/server/lib/background.ts` — `runInBackground()` (waitUntil wrapper)
- `src/server/lib/cron-auth.ts` — constant-time Bearer check, fails closed
- `src/routes/api.cron.cleanup-uploads.ts` — secured cleanup endpoint
- `scripts/migrate-local-assets-to-r2.ts` — LOCAL → R2 utility
- `scripts/verify-phase19.ts` — 39 checks
- `scripts/verify-phase19-http.ts` — 16 checks against the built app
- `PHASE19_REPORT.md`

## D. Files modified

`.env.example`, `.gitignore`, `.prettierignore`, `DEPLOYMENT.md`, `eslint.config.js`, `package.json`, `package-lock.json`, `vite.config.ts`, `src/lib/comm-refresh.ts`, `src/routes/api.events.ts`, `src/routeTree.gen.ts` (generated), `src/server/auth/auth-service.ts`, `src/server/env.ts`, `src/server/services/realtime-service.ts`.

`package.json`: new dependency `@vercel/functions`; new scripts `media:migrate-local`, `verify:phase19`, `verify:phase19:http`.

## E. Database changes

- Migration added: **No.** Schema unchanged. No migrations edited, deleted, squashed or regenerated.
- Neon migration actually executed: **No** (`NOT TESTED`, needs your Neon).
- Data changed: only in disposable local `_test` databases. The new LOCAL→R2 tool changes data **only when you run it with `--execute`** (flips `storageProvider` LOCAL→S3 after verifying the object in the bucket; deletes nothing).

## F. Environment variables

Only variables the code actually reads.

```text
# Required in production
DATABASE_URL=            # Neon POOLED string
DIRECT_URL=              # Neon DIRECT string (migrations / admin:create only)
SESSION_SECRET=          # 32+ random chars
APP_URL=                 # https://your-production-url, no trailing slash

STORAGE_PROVIDER=s3
S3_ENDPOINT=             # https://<ACCOUNT_ID>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=

EMAIL_PROVIDER=gmail
GMAIL_USER=
GMAIL_PASS=              # 16-letter Google App Password (never the normal password)

# Recommended (new in Phase 19)
CRON_SECRET=             # 32+ random chars, different from SESSION_SECRET

# Optional
REALTIME_SSE=auto        # auto | on | off
PAYMENT_PROVIDER=simulated
INSTRUCTOR_REVENUE_SHARE_PERCENT=70
MINIMUM_PAYOUT_AMOUNT=50
EMAIL_FROM=              # optional with gmail

# Only if you choose Resend instead of Gmail
RESEND_API_KEY=
```

Development-only: `EMAIL_PROVIDER=console`, `STORAGE_PROVIDER=local`, `LOCAL_STORAGE_ROOT`, `ALLOW_LOCAL_STORAGE_IN_PRODUCTION`, `ALLOW_DEMO_SEED`. Set by Vercel itself: `VERCEL`, `NODE_ENV`.

Which Vercel environment gets what:

| Variable group                    | Production | Preview                                | Development      |
| --------------------------------- | ---------- | -------------------------------------- | ---------------- |
| `DATABASE_URL`, `DIRECT_URL`      | Neon prod  | **separate Neon branch**, never prod   | Local PostgreSQL |
| `SESSION_SECRET`, `CRON_SECRET`   | unique     | **different** values                   | local values     |
| `APP_URL`                         | prod URL   | unset or the preview URL               | localhost        |
| `S3_*`                            | prod bucket| **separate bucket**, or no uploads     | dev bucket/local |
| `EMAIL_PROVIDER`, `GMAIL_*`       | gmail      | optional                               | console          |

## G. Build and checks (each separately)

| Command / check                                                     | Result                                                                                                                  |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `npm ci` (original lockfile)                                        | EXECUTED FAIL                                                                                                           |
| `npm ci` (after lockfile sync)                                      | EXECUTED PASS                                                                                                           |
| `npm run db:generate`                                               | **BLOCKED** in my sandbox (Prisma engine host returns 403). The shipped generated client matches the schema (29 models). Run it yourself: it runs automatically inside `npm run build` on Vercel. |
| `npm run build` (full: generate + vite)                             | **BLOCKED** for the same reason. Not claimed.                                                                           |
| `npm run build:app` (Vite/Nitro, node preset)                       | EXECUTED PASS                                                                                                           |
| `build:app` with Vercel preset                                      | EXECUTED PASS: `.vercel/output/config.json` contains version 3 and the cron `/api/cron/cleanup-uploads` at `17 3 * * *` |
| `npm run lint`                                                      | EXECUTED PASS: 0 errors, 11 warnings (unchanged react-refresh warnings)                                                 |
| `npx tsc --noEmit` (no npm script exists)                           | EXECUTED FAIL: 10 errors, same count as before Phase 19; none from Phase 19 files                                       |
| 13 migrations replayed on empty PostgreSQL 16 via `psql`            | EXECUTED PASS                                                                                                           |
| Schema vs migrated DB (tables, columns, nullability, enums)         | EXECUTED PASS. Indexes/defaults/FKs not compared.                                                                       |
| `prisma migrate deploy` (any database)                              | NOT TESTED (Prisma engines blocked here; Neon not available)                                                            |
| Client bundle secret scan (build with sentinel secret values; 140 client files) | EXECUTED PASS: 0 sentinel values and 0 occurrences of the names `SESSION_SECRET`, `DATABASE_URL`, `DIRECT_URL`, `S3_SECRET_ACCESS_KEY`, `S3_ACCESS_KEY_ID`, `GMAIL_PASS`, `GMAIL_USER`, `CRON_SECRET`, `RESEND_API_KEY`. Control: names are present in the server bundle; values are read at runtime, not baked in. |
| `npm audit`                                                         | EXECUTED. See section J.                                                                                                |

## H. Regression results (local PostgreSQL 16, fresh disposable `_test` database for each suite)

| Suite                                     | Result                |
| ----------------------------------------- | --------------------- |
| verify-phase10                            | EXECUTED PASS 104/104 |
| verify-phase11                            | EXECUTED PASS 120/120 |
| verify-phase12                            | EXECUTED PASS 63/63   |
| verify-phase15                            | EXECUTED PASS 73/73   |
| verify-phase15-security                   | EXECUTED PASS 35/35   |
| verify-phase16 (includes reset email)     | EXECUTED PASS 81/81   |
| verify-phase18 (S3 mode, fake S3)         | EXECUTED PASS 117/117 |
| verify-phase18 local mode                 | EXECUTED PASS 8/8     |
| **verify-phase19 (new)**                  | EXECUTED PASS 39/39   |
| **verify-phase19-http (new, built app)**  | EXECUTED PASS 16/16   |
| verify-phase18-http, verify-phase18-client | **NOT RE-RUN** in Phase 19 (they passed in Phase 18) |
| Phase 17                                  | No verify script exists in the repository.            |

What the new suites prove (all local, fake S3): cron endpoint 503 with no secret, 401 for missing/wrong token or cookie, 200 with the right token; it deletes only the abandoned object and intent, leaves unexpired ones, and is idempotent; POST does not run cleanup; `/api/events` is 204 on Vercel (auto), 401 locally and with `REALTIME_SSE=on`; the migration tool in dry run changes nothing and never prints keys, execute copies and flips rows, a different-size bucket object is left alone and reported, a missing local file is reported and nothing is created, existing S3 rows are untouched, no rows or files are deleted, a second run is idempotent, and it refuses when `STORAGE_PROVIDER` is not `s3`.

## I. Production tests

| Where                         | Result                                                                                       |
| ----------------------------- | -------------------------------------------------------------------------------------------- |
| Locally executed              | Everything in section H and G.                                                               |
| Real Neon                     | NOT TESTED                                                                                   |
| Real R2 (CORS, signed URLs)   | NOT TESTED (your Phase 18 manual test passed earlier; production origin not yet tested)      |
| Real Gmail                    | NOT TESTED                                                                                   |
| Real Vercel / browser         | NOT TESTED (deploy, cron run, `waitUntil` email, Range seeking, direct-upload Network tab)   |
| Media playback / Range on Vercel | CODE REVIEW ONLY here; local Range/entitlement behaviour was covered by Phase 18 HTTP tests (not re-run). |
| Cookies / APP_URL switch      | CODE REVIEW ONLY plus Phase 15/16 suites. Startup validation of https `APP_URL` observed.    |

## J. Remaining production limitations

- **Payments and payouts are simulated.** No real money moves.
- **Gmail instead of a transactional provider.** Daily sending limits apply and Gmail always sends as `GMAIL_USER`. Resend is already supported if you outgrow it.
- **Rate limiter is in memory, per instance.** Not global.
- **Live push is off on Vercel by default.** Polling every 20–30 s. `REALTIME_SSE=on` is best effort only.
- **Abandoned-upload cleanup is once a day**, one batch of 200 per run (Vercel Hobby limit). Not a real-time cleanup.
- **Legacy LOCAL assets** need `npm run media:migrate-local` (or re-upload). I could not count them: I do not have your database.
- **No malware scanning** of uploaded files.
- **Video streams through a Vercel function** (private playback must stay behind authorization). Long videos use function time and bandwidth; watch your Vercel usage.
- **No Content-Security-Policy yet** (needs runtime testing).
- **10 TypeScript errors** remain (deferred, see B-6).
- **npm audit**: 8 findings (1 moderate, 7 high), none critical.
  - Production-tree (4): `prisma` (CLI), `@prisma/config`, `deepmerge-ts`, `mysql2` (all pulled in by the Prisma 7 CLI/toolchain). `mysql2` and `deepmerge-ts` do **not** appear in the built server bundle, so they are not reachable by the running app. The only offered fix is `prisma@6.19.3`, a major **downgrade** that conflicts with Prisma 7, so I did not apply it. Unresolved; re-check on the next Prisma 7 patch.
  - Dev-only (4): `s3rver` (fake S3 for tests) and its `busboy`, `dicer`, `fast-xml-parser`. Never deployed. Fix is a breaking `s3rver` change; not applied.
  - I did not run `npm audit fix --force`.
- Gmail on serverless: the email is sent with `waitUntil`; if a send fails it is logged without the address or token and the user still sees the same neutral message (no account enumeration).

---

## K. Deployment instructions for you (no secrets needed by me)

**1. Neon.** Create a project and database. In **Connect** copy two strings: **pooled** (host has `-pooler`) and **direct**. Keep `?sslmode=require`.

**2. Apply migrations** (PowerShell, from the project folder):

```powershell
$env:DATABASE_URL = "<NEON_POOLED_URL>"
$env:DIRECT_URL   = "<NEON_DIRECT_URL>"
npm install
npm run db:generate
npm run db:migrate:deploy
Remove-Item Env:DATABASE_URL, Env:DIRECT_URL
```

Expected: 13 migrations applied. Never run `prisma migrate reset` or `db push` here. Do **not** run `npm run db:seed`.

**3. First admin** (one time):

```powershell
$env:DATABASE_URL = "<NEON_POOLED_URL>"; $env:DIRECT_URL = "<NEON_DIRECT_URL>"
$env:ADMIN_EMAIL = "you@example.com"; $env:ADMIN_NAME = "Your Name"; $env:ADMIN_PASSWORD = "<12+ chars, unique>"
npm run admin:create
Remove-Item Env:ADMIN_PASSWORD, Env:DATABASE_URL, Env:DIRECT_URL
```

**4. Secrets.** Generate `SESSION_SECRET` and `CRON_SECRET` (two different values):
`node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`

**5. Vercel.** Push to GitHub (check `.env` is not committed). Import the repo, leave build commands as default, Node 22. Add the variables from section F to **Production** only (use separate DB/bucket/secrets for Preview). Deploy.

**6. APP_URL.** After Vercel gives your URL, set `APP_URL=https://<that-url>` and redeploy.

**7. R2 CORS** (bucket -> Settings -> CORS Policy), exact origin, no `*`:

```json
[
  {
    "AllowedOrigins": ["https://<your-production-url>"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": [],
    "MaxAgeSeconds": 3600
  }
]
```

Add `http://localhost:3000` only if you point local dev at a real bucket. The bucket stays private.

**8. Gmail.** Google Account -> Security -> 2-Step Verification -> App passwords. Put the 16 letters in `GMAIL_PASS`, your address in `GMAIL_USER`, `EMAIL_PROVIDER=gmail`.

**9. Cron.** Vercel -> Settings -> Cron Jobs: confirm `/api/cron/cleanup-uploads`. Run it once from there; expect 200.

**10. Old local files (only if you have LOCAL assets).** See DEPLOYMENT.md, "Old LOCAL files": dry run first.

**Smoke tests** (mark each yourself):

- Public: home, courses, course detail, search, certificate verification.
- Auth: register, login, logout, password reset (link must start with your https URL; reuse of the link fails; old password stops working), session persists after refresh.
- Student: free enroll, simulated paid purchase (wording says test/simulated), My Learning, complete lesson, review, certificate, purchases, messages, notifications, avatar upload.
- Instructor: dashboard, thumbnail / preview / lesson video / resource upload. In the browser **Network** tab: a `PUT` to `*.r2.cloudflarestorage.com` carries the big body; the Learnora requests (intent, finalize) are small; the asset appears only after finalize.
- Admin: dashboard, users, courses, instructor approval, enrollments, payments, refunds, payouts, reports, reviews, categories.
- Media: thumbnail, preview, lesson video with seeking, resource download, avatar, delete.
- Security: logged-out protected page redirects; another user's order/certificate URL is refused; lesson video without enrollment (or after refund) is refused; non-admin on admin route is refused; `curl https://<url>/api/cron/cleanup-uploads` without the token returns 401.
