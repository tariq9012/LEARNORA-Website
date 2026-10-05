# Learnora — Production Deployment Guide (Phases 17–19)

Target: **Vercel** (app) + **Neon** (PostgreSQL) + **Cloudflare R2** (files) + **Gmail or Resend** (email).
Payments are **simulated** — no real money is ever processed.

> This guide was written from code review plus local testing. It has **not** been executed against real
> Vercel / Neon / R2 / Gmail accounts. See [Verification status](#10-verification-status).

---

## 1. How the pieces fit

```
Browser
  │  HTTPS
  ▼
Vercel  (TanStack Start + Nitro, Node functions)
  │   • pages, server functions, raw upload/media routes, auth, CSRF
  │   • decides WHO may see a file (media routes)
  ├──► Neon PostgreSQL   all data: users, courses, orders, asset rows, upload intents
  ├──► Cloudflare R2     PRIVATE bucket: file bytes only. Never public.
  └──► Gmail / Resend    password-reset email

Uploads (Phase 18) do NOT pass through Vercel:
Browser ──(1) "may I upload this?" metadata only──► Vercel ──► short-lived signed URL
Browser ──(2) PUT the file ─────────────────────────────────► R2   (direct)
Browser ──(3) "it's uploaded" ──► Vercel verifies the object in R2, then saves the Asset
```

| Part   | Responsibility                                                                                                                  |
| ------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Vercel | Runs the app. Holds all secrets as environment variables. Only the app talks to Neon, R2 and email.                             |
| Neon   | Source of truth. Migrations are applied **by you, once per release**, never by the app.                                         |
| R2     | Stores uploaded files. The browser never gets a bucket link; every file goes through Learnora's authorized `/media/...` routes. |
| Email  | Sends password-reset links that point to `APP_URL`.                                                                             |

No `vercel.json` is needed: Vercel detects TanStack Start with the Nitro plugin that is already in `vite.config.ts`.

---

## 2. Before you start — read these limits

1. **Large uploads work on Vercel because they no longer go through it (Phase 18).** Vercel Functions reject
   request bodies over about **4.5 MB**, so with `STORAGE_PROVIDER=s3` the browser uploads straight to R2
   (see section 5). **This only works after you add the R2 CORS rule in section 5**; without it the browser
   blocks the upload. The old server-mediated upload routes deliberately refuse requests in R2 mode.
   Limits are unchanged: avatar 3 MB, thumbnail 5 MB, resource 50 MB, preview 100 MB, lesson video 500 MB.
2. **Rate limiting is per server instance.** It is in memory, so it is not shared across Vercel instances.
   Treat it as a basic brake, not production-wide protection.
3. **Live push (SSE) is switched off by default on Vercel (Phase 19).** An in-memory broker cannot reach other
   instances, and every open stream would occupy a function invocation. On Vercel `/api/events` answers `204`
   and the browser stops retrying after a few attempts. Messages and notifications keep arriving through polling
   (about every 20-30 seconds). Set `REALTIME_SSE=on` to turn the stream back on (best effort: only users on the
   same instance get instant updates).
4. **`KNOWN ISSUE — deferred media rendering investigation`:** some course cards/pages may not render
   certain uploaded thumbnails or videos, and old `LOCAL` assets are missing if their files were not copied.
   Direct `/media/public/<assetId>` access has worked in tests. This is being investigated separately and
   is **not** a sign that R2 is broken. Do not treat it as a deployment failure.
5. **No Content-Security-Policy yet.** A wrong CSP breaks hydration and media, so it needs runtime testing
   first. Four safe headers are already set (see section 9).

---

## 3. Environment variables (names only)

Copy `.env.example` for local work. **Never commit `.env`.** Never prefix any of these with `VITE_`
(Vite would publish it to the browser).

**Required in production**

| Name                                        | Notes                                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------- |
| `DATABASE_URL`                              | Neon **pooled** string (host contains `-pooler`). Used by the running app.      |
| `DIRECT_URL`                                | Neon **direct** string (no `-pooler`). Used only for migrations / admin script. |
| `SESSION_SECRET`                            | 32+ random characters. Production refuses the dev placeholder.                  |
| `APP_URL`                                   | Your public `https://` address, no trailing slash. Used for reset-email links.  |
| `STORAGE_PROVIDER`                          | Must be `s3` (R2). `local` is rejected on Vercel.                               |
| `S3_ENDPOINT`                               | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`                                 |
| `S3_REGION`                                 | `auto`                                                                          |
| `S3_BUCKET`                                 | Your R2 bucket name.                                                            |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | R2 API token credentials.                                                       |
| `EMAIL_PROVIDER`                            | `gmail` or `resend` (`console` is development-only and rejected).               |
| `GMAIL_USER`, `GMAIL_PASS`                  | If `gmail`. `GMAIL_PASS` is a 16-letter Google **App Password**.                |
| `RESEND_API_KEY`, `EMAIL_FROM`              | If `resend` (domain must be verified in Resend).                                |

**Optional, recommended:** `CRON_SECRET` (32+ random characters). Authorizes the daily upload cleanup job
(section 5). Without it the cron endpoint answers `503` and does nothing. `REALTIME_SSE` (`auto` default / `on` / `off`).

**Optional:** `PAYMENT_PROVIDER` (only `simulated`), `INSTRUCTOR_REVENUE_SHARE_PERCENT`, `MINIMUM_PAYOUT_AMOUNT`, `EMAIL_FROM` (gmail).

**Development-only:** `EMAIL_PROVIDER=console`, `STORAGE_PROVIDER=local`, `LOCAL_STORAGE_ROOT`, `ALLOW_LOCAL_STORAGE_IN_PRODUCTION`, `ALLOW_DEMO_SEED`.

**Which Vercel environment gets what**

| Variable group                                                      | Production | Preview                                   | Development (`vercel dev`) |
| ------------------------------------------------------------------- | ---------- | ----------------------------------------- | -------------------------- |
| `DATABASE_URL`, `DIRECT_URL`                                        | Neon prod  | A **separate Neon branch**, never prod    | Local PostgreSQL           |
| `SESSION_SECRET`, `CRON_SECRET`                                     | unique     | **different** values from Production      | local values               |
| `APP_URL`                                                           | prod URL   | usually leave unset or use the preview URL | `http://localhost:3000`    |
| `S3_*`, `STORAGE_PROVIDER=s3`                                       | prod bucket | a **separate bucket** (or no uploads)     | dev bucket or `local`      |
| `EMAIL_PROVIDER`, `GMAIL_*`                                         | gmail      | optional                                  | `console`                  |

Preview deployments run production code. If a Preview shared the production database or bucket, a test click could
change real data, so give it its own. Only the **Production** environment needs the production values.

Generate a session secret:

```
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

If a variable is wrong, production refuses requests and the log names **only the variable**, never its value.

---

## 4. Neon (database)

1. Create a Neon project and a database.
2. In the Neon dashboard, open **Connect**. Copy **two** strings:
   - **Pooled** (hostname has `-pooler`) → this becomes `DATABASE_URL`.
   - **Direct** (no `-pooler`) → this becomes `DIRECT_URL`.
3. Keep `?sslmode=require` on both.
4. Why two? The app uses the pooled one so serverless functions do not exhaust connections.
   Migrations need the direct one (they take locks that do not work reliably through a transaction pooler).
   The app never falls back from `DIRECT_URL` to the pooled string for migrations.

---

## 5. Cloudflare R2 (files)

1. Cloudflare dashboard → **R2** → **Create bucket**. Keep it **private** (do **not** enable public access or an `r2.dev` URL).
2. **R2 → Manage API tokens → Create API token**: permission **Object Read & Write**, limited to this one bucket.
3. Copy the Access Key ID and Secret (shown once) and your Account ID.
4. Set `S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, `S3_REGION=auto`, `S3_BUCKET=<name>`,
   `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `STORAGE_PROVIDER=s3`.
5. **Add the CORS rule below.** The browser uploads files directly to R2 (Phase 18), so R2 must allow your site's origin to `PUT`.
6. Old files keep being served from where they were stored (`Asset.storageProvider`). Switching only affects **new** uploads. Old `LOCAL` assets are **not** migrated automatically.

### R2 CORS rule (required, one time)

R2 dashboard → your bucket → **Settings → CORS Policy → Add CORS policy** → paste:

```json
[
  {
    "AllowedOrigins": ["https://your-production-domain.example"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": [],
    "MaxAgeSeconds": 3600
  }
]
```

- `AllowedOrigins`: your exact production origin, the same as `APP_URL` (scheme + host, **no trailing slash**, no path). Do not use `"*"`.
- Only `PUT` is needed. The browser never reads from R2 (playback and downloads go through Learnora's authorized `/media/...` routes), so no `GET`/`HEAD` and no exposed headers (single-part uploads need no `ETag`).
- Local development normally uses `STORAGE_PROVIDER=local` and needs **no** CORS. Only if you point a local `npm run dev` at a real R2 bucket, add `"http://localhost:3000"` to `AllowedOrigins` (ideally on a separate dev bucket, not production).
- Vercel preview deployments have different URLs. To test uploads on a preview, add that exact preview origin temporarily.
- The dashboard's JSON field layout can differ slightly between Cloudflare UI versions; the values above (origin, `PUT`, `Content-Type`) are what matter.
- The bucket stays **private**. Do not enable public access or an `r2.dev` URL.

### How uploads work (Phase 18)

1. **Intent** — the browser sends only metadata (`purpose`, course/lesson id, filename, MIME type, size) to `POST /api/media/upload-intent`. The server checks login, CSRF, role (approved instructor, or any signed-in user for avatars), course/lesson ownership, that the course is editable, the allowed type and the size limit. Only then it records an _upload intent_ and returns a presigned `PUT` URL.
2. **Upload** — the browser `PUT`s the file to that URL. The URL works for **one object key chosen by the server**, for **10 minutes**, and binds `Content-Type`. It carries no secret key. (A signed URL necessarily contains the access key _ID_; the secret never leaves the server.)
3. **Finalize** — the browser calls `POST /api/media/upload-finalize` with only the intent id. The server loads **its own** intent row (owned by that user), re-checks authorization, then verifies the object in R2: it exists, size equals the declared size, stored `Content-Type` equals the declared one, and the first bytes match the declared file type (same magic-byte check as before, using a 32-byte ranged read). On any mismatch the object is deleted and nothing is saved. On success **one database transaction** creates the Asset and switches the course/lesson/avatar to it; the previous object is deleted only after that commit.
4. Finalize is **idempotent**: double-clicks, retries and simultaneous calls return the same result and create exactly one Asset.
5. The UI shows _Preparing → Uploading (real %) → Finalizing_ and says "Upload complete" only after finalize succeeds. Cancel is available while uploading; Retry requests a fresh signed URL.

With `STORAGE_PROVIDER=local` (development) the server answers `{ "mode": "server" }` and the browser uses the original multipart upload.

What is **not** verified by finalize: the full file content (only the first 32 bytes are checked, because reading the whole object would bring it through Vercel). There is **no malware scanning**.

### Abandoned uploads (automatic daily cleanup + manual command)

If someone closes the tab after the `PUT` but before finalize, the object stays in R2 with no database record pointing at it. Intents expire 2 hours after creation.

**Automatic (Phase 19):** the build registers a Vercel Cron job (`17 3 * * *`, daily, 03:17 UTC) that calls
`GET /api/cron/cleanup-uploads`. To enable it, set a `CRON_SECRET` (32+ random characters) in Vercel for **Production**.
Vercel then sends `Authorization: Bearer <CRON_SECRET>` itself. Behaviour:

- No `CRON_SECRET` set: the endpoint answers `503` and does nothing. Wrong or missing token: `401`.
- One batch of up to 200 intents per run; it never touches an object that an Asset uses or an intent that is still within its window plus a one-hour grace; running it twice is harmless.
- It logs counts only (scanned / deleted / skipped / errors), never keys or URLs.
- Daily is the most frequent schedule Vercel's Hobby plan allows. If a run reports `moreMayRemain: true` for many days, run the manual command once.
- Check it under Vercel -> your project -> **Settings -> Cron Jobs**; you can run it once from there.

**Manual** (needs the production env vars in your shell):

```powershell
npm run media:cleanup-intents                 # dry run: only reports
npm run media:cleanup-intents -- --execute    # deletes
```

Objects replaced or removed _before_ Phase 18, or whose cleanup call failed, are not tracked by intents.

### Old LOCAL files (legacy assets)

Vercel has no persistent disk. Any asset whose `storageProvider` is still `LOCAL` is answered with a clean `404 File is missing from storage`. Nothing is deleted automatically. To move them to R2, run this **from the computer that still has the old `storage/uploads` folder** (PowerShell):

```powershell
$env:DATABASE_URL = "<database whose assets you are moving>"
$env:SESSION_SECRET = "<any 32+ characters>"
$env:STORAGE_PROVIDER = "s3"
$env:S3_ENDPOINT = "https://<ACCOUNT_ID>.r2.cloudflarestorage.com"
$env:S3_REGION = "auto"
$env:S3_BUCKET = "<bucket>"
$env:S3_ACCESS_KEY_ID = "<id>"
$env:S3_SECRET_ACCESS_KEY = "<secret>"
$env:LOCAL_STORAGE_ROOT = "./storage/uploads"
npm run media:migrate-local                       # DRY RUN: counts only, changes nothing
npm run media:migrate-local -- --execute          # copies, verifies size, then flips the row to S3
```

It never deletes rows or local files, never overwrites an existing bucket object (a different-size object is reported as a conflict), skips what is already done, and prints counts and asset ids only. Assets whose local file is gone are listed as `local file missing`: re-upload those in the instructor dashboard. If you start from a fresh Neon database there are normally no LOCAL assets at all.

### Troubleshooting uploads

| Symptom                                                        | Likely cause and fix                                                                                                                                                                    |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser console: "blocked by CORS policy", upload fails fast   | The R2 CORS rule is missing, or `AllowedOrigins` doesn't exactly equal the page's origin (http vs https, `www`, trailing slash, preview URL). Fix the rule and retry.                   |
| `403` on the PUT (or "permission expired or was rejected")     | The signed URL expired (10 min) — just retry, a fresh URL is requested. If it never works: wrong `S3_ACCESS_KEY_ID`/`SECRET`, token not scoped to this bucket, or server clock far off. |
| `SignatureDoesNotMatch` / `AccessDenied` in the PUT response   | `S3_ENDPOINT`, `S3_BUCKET` or region differ from what R2 expects, or a proxy/extension altered the `Content-Type` header. Use `S3_REGION=auto` and the account endpoint.                |
| "The file hasn't finished uploading yet" at finalize           | The PUT didn't complete (or went to a different bucket). Retry the upload.                                                                                                              |
| "size doesn't match" / "type doesn't match" at finalize        | The browser sent different bytes or headers than declared. The object is deleted; retry.                                                                                                |
| "The file's contents don't match its claimed type" at finalize | The file's first bytes don't match its type (e.g. a renamed file). Use a real MP4/WebM/PNG/etc.                                                                                         |
| "This upload expired"                                          | More than 2 hours passed between choosing the file and finishing. Upload again.                                                                                                         |
| Upload reached R2 but finalize keeps failing (5xx)             | Check `/api/ready` (database). The client retries finalize 3 times automatically; retrying the page action is safe — it never duplicates.                                               |
| "Uploads in this environment go directly to storage"           | An old page/script called the legacy upload route while `STORAGE_PROVIDER=s3`. Refresh the page.                                                                                        |
| "Too many uploads in progress"                                 | 20 unfinalized intents are open for that user. Wait for them to expire, or run the cleanup command.                                                                                     |
| Unfinalized objects accumulate in the bucket                   | Expected after abandoned uploads. Run `npm run media:cleanup-intents -- --execute` periodically.                                                                                        |

---

## 6. Email

**Gmail (low volume, about 500/day):** Google Account → Security → turn on 2-Step Verification → **App passwords** →
create one → set `GMAIL_USER` (the address) and `GMAIL_PASS` (the 16 letters; spaces are ignored). Never use your real Gmail password.
Gmail always sends from `GMAIL_USER`.

**Resend (better for real traffic):** verify a domain, then set `RESEND_API_KEY` and `EMAIL_FROM`.

Set `APP_URL` to the final deployed address **before** testing "Forgot password". Reset links are built only from `APP_URL`
(never from the request's Host/Origin). Tokens, passwords and secrets are never logged.

---

## 7. Deploy — exact order

Do the steps in this order. Migrations are a **manual, controlled step**; the app never changes the database on boot or per request.

**Step 1 — Create Neon, R2 and email credentials** (sections 4–6).

**Step 2 — Apply migrations to Neon from your computer** (PowerShell shown; use `export` on macOS/Linux):

```powershell
$env:DIRECT_URL = "<Neon DIRECT string>"
$env:DATABASE_URL = "<Neon POOLED string>"
npm install
npm run db:generate
npm run db:migrate:deploy
Remove-Item Env:DATABASE_URL, Env:DIRECT_URL      # clear them from this shell afterwards
```

Expected: all 13 migrations apply in order (the newest, `20261003120000_upload_intents`, only adds one new table). **Never** run `prisma migrate reset` or `prisma db push` against production.
Run `npm run db:migrate:deploy` again for every future release that adds a migration, **before** (or together with) deploying that code.
Every current migration is additive or an index swap; the only conditional risk is in
`20260926100000_reporting_preferences_realtime` (converts `reports.reason` text to an enum — it aborts safely with no data change if a
legacy row has a non-enum value; on a new empty database it is fine).

**Step 3 — Create the first admin (do NOT run the demo seed):**

```powershell
$env:ADMIN_EMAIL = "you@your-domain.example"
$env:ADMIN_NAME = "Your Name"
$env:ADMIN_PASSWORD = "<12+ character unique password>"
npm run admin:create
Remove-Item Env:ADMIN_PASSWORD
```

It creates one admin, stops if the email already exists, rejects the demo passwords, and never prints the password.
`npm run db:seed` creates accounts with **known passwords** (including an admin). It now refuses when `NODE_ENV=production`
or when the database host is not local, unless you deliberately set `ALLOW_DEMO_SEED=true` (throwaway demo databases only).

**Step 4 — Import the repository into Vercel**

1. Push to GitHub (check `.env` is not committed; `.gitignore` already excludes it).
2. Vercel → **Add New → Project** → import the repo. Framework: TanStack Start (auto-detected).
3. Leave **Install** and **Build** commands at their defaults. `npm run build` runs `prisma generate` and then `vite build`,
   which is required because the generated Prisma client (`src/generated`) is not committed.
4. Set **Node.js Version** to 22.x (the version used for testing).
5. Add every **required** variable from section 3 for **Production** (and Preview if you use previews; never point Preview at the production database).
6. Deploy. If you do not know your final URL yet, deploy once, then set `APP_URL` to the real `https://` address and redeploy.

**Step 4b — Enable the cleanup job:** in Vercel add `CRON_SECRET` (Production) and redeploy. Then open **Settings -> Cron Jobs** and confirm `/api/cron/cleanup-uploads` is listed.

**Step 5 — Smoke test** (section 8).

---

## 8. Post-deployment smoke tests

Mark each as you do it. Items marked ⚠ relate to the known issue in section 2.

1. `GET /api/health` → `{"status":"ok"}`.
2. `GET /api/ready` → `{"status":"ready","checks":{"config":"ok","database":"ok"}}` (503 `not_ready` if config/DB is wrong; it never shows credentials).
3. Register a student, log in, log out. Cookie should be `HttpOnly; Secure; SameSite=Lax`.
4. **Forgot password** → email arrives → the link starts with your `APP_URL` → reset works → old password stops working.
5. Free enrollment.
6. Simulated paid enrollment (page says "Test payment — no real money will be charged").
7. Protected course access: a different student cannot open the course player.
8. Instructor: dashboard, course management (log in with an instructor account you created/approved yourself).
9. Admin: log in with the account from Step 3; open users, courses, payments, payouts, reports.
10. Media upload (needs the R2 CORS rule from section 5): upload a thumbnail and an avatar; confirm the object appears in the R2 bucket and the Asset row says `S3`.
    10b. **Large upload:** upload a lesson video larger than 5 MB (ideally 50 MB+) and a resource larger than 5 MB. In the browser's Network tab you should see the `PUT` going to your R2 hostname (not to your Vercel domain), then a small `upload-finalize` request. Play the video and seek (jump forward) to confirm Range playback; as an unenrolled student confirm the lesson video is refused.
    10c. Replace the video with a different file; the old one should disappear from the bucket. Remove it; the object should disappear.
11. Messages: send a message between student and instructor; it should appear after the next poll (20–30 s) even without live push.
12. Certificate verification: open `/certificates/verify/<code>` (public page) for a completed course.
13. Response headers on `/`: `x-content-type-options`, `referrer-policy`, `x-frame-options`, `permissions-policy` present.
14. ⚠ `KNOWN ISSUE — deferred media rendering investigation`: if some thumbnails do not render, note it but do not count it as a deployment failure.

---

## 9. Security notes

- Secrets live only in Vercel environment variables and your local `.env`. The production client bundle was scanned: no secret names, connection strings or server-only libraries appear in it.
- Cookies: HttpOnly, SameSite=Lax, Secure in production.
- CSRF: every state-changing raw media route and every server function enforces it; read-only GET media streaming does not need it.
- Authorization is enforced server-side on every protected server function and route; hidden buttons are not relied on.
- Headers set on every response: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `X-Frame-Options: DENY`, `Permissions-Policy` (camera, microphone, geolocation, payment disabled).
- Not set: `Content-Security-Policy` (needs runtime testing) and `Strict-Transport-Security` (Vercel adds it on its own domains;
  add it on your custom domain after HTTPS is confirmed).
- Direct uploads: the browser receives a signed URL for one key, valid 10 minutes, and never your secret key. Finalize trusts only the server's own intent record, verifies the object in R2 and creates the Asset in one transaction. See section 5.
- Demo accounts (`admin@learnora.dev` etc.) exist only in `prisma/seed.ts` and the local verify scripts, never in the UI. Do not create them in production.
- If you ever commit a secret by accident, **rotate it** (new Neon password, new R2 token, new Gmail App Password, new `SESSION_SECRET`).
  Changing `SESSION_SECRET` signs everyone out.

---

## 10. Verification status

| Item                                                                                                                                     | Status                           |
| ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Local production build + server, `/api/health`, `/api/ready` (healthy, DB down, bad config)                                              | EXECUTED PASS (local)            |
| All 13 migrations on empty PostgreSQL 16 (via `psql`, not `prisma migrate deploy`)                                                       | EXECUTED PASS (local)            |
| Regression suites phase 10 / 11 / 12 / 15 / 15-security / 16 (re-run in Phase 19: 104 / 120 / 63 / 73 / 35 / 81 checks)                  | EXECUTED PASS (local PostgreSQL) |
| CSRF and role checks against the production build (no token 403, wrong token 403, right token passes, student on instructor route 403)   | EXECUTED PASS (local)            |
| Security headers on pages, API, errors, static files                                                                                     | EXECUTED PASS (local)            |
| Client bundle secret scan                                                                                                                | EXECUTED PASS                    |
| Phase 18 direct upload: service suite (s3 mode 117 checks, local mode 8) against a fake S3, mutation-checked                             | EXECUTED PASS (local, fake S3)   |
| Phase 18 over HTTP on the production build (72 checks: auth, CSRF, intent/finalize, 80 MB video, playback, entitlement, delete)          | EXECUTED PASS (local, fake S3)   |
| Phase 18 browser upload client executed in Node (26 checks: phases, progress, cancel, retry, failed PUT never finalizes) — XHR is a shim | EXECUTED PASS (local, fake S3)   |
| Real browser upload through real CORS; presigned URLs accepted by real Cloudflare R2                                                     | NOT TESTED (needs your R2)       |
| `prisma migrate deploy` against Neon, Vercel deploy, Gmail delivery                                                                      | NOT TESTED (needs your accounts) |
| Phase 19: cron auth, SSE switch, env vars, background helper, LOCAL→S3 tool (39 checks) + over HTTP on the built app (16 checks)          | EXECUTED PASS (local, fake S3)   |
| Phase 19: Vercel preset build registers the daily cron in `.vercel/output/config.json`                                                   | EXECUTED PASS (local build)      |
| Real Vercel Cron call, real Vercel `waitUntil` email delivery                                                                            | NOT TESTED (needs your Vercel)   |
| Browser click-through of all roles                                                                                                       | NOT TESTED                       |

---

## 11. Verifying direct uploads locally (no Cloudflare needed)

These use `s3rver`, a **fake** S3 server, so they prove the application logic but **not** that real R2 accepts the signed URLs. Use a throwaway database whose name ends in `_test`, freshly migrated and seeded.

```powershell
npm run verify:phase18          # direct-upload logic, STORAGE_PROVIDER=s3 (fake S3 on port 4570)
npm run verify:phase18:local    # STORAGE_PROVIDER=local keeps the old flow
```

`npm run verify:phase18:client` runs the real browser upload code in Node (with an `XMLHttpRequest` shim) against the running build; it needs the same setup as `:http`.

`npm run verify:phase18:http` drives a running production build over HTTP; it needs the app started with the same `S3_*` variables as the script and `SERVER_PID` set (see the comment at the top of `scripts/verify-phase18-http.ts`).
