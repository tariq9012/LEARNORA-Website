# Phase 18 Report — Direct-to-Cloudflare-R2 Large Media Uploads

Labels: EXECUTED PASS / EXECUTED FAIL / CODE REVIEW ONLY / NOT TESTED / BLOCKED.
**No real Cloudflare R2, Vercel, or real browser was used.** Everything marked EXECUTED ran locally against
PostgreSQL 16 and `s3rver` (a fake S3 that does **not** validate signatures). Nothing is claimed about real R2.

## 1. Existing upload architecture found (before Phase 18)

- **Storage abstraction:** `StorageProvider` (`kind`, `save`, `delete`, `stat`, `read` with Range) with `LocalStorageProvider` and
  `S3StorageProvider` (`@aws-sdk/client-s3` + `@aws-sdk/lib-storage`, streaming multipart). Chosen by `STORAGE_PROVIDER`; env validated in `src/server/env.ts`.
- **Asset model:** `Asset.storageProvider` (`StorageProviderKind` = `LOCAL | S3`), `Asset.storageKey` (`@unique`), mime, size, purpose.
- **Upload:** five raw `POST` routes (thumbnail, preview, lesson-video, lesson-resource, avatar) streamed the whole file **through the app server**
  (busboy → `receiveMultipartUpload`: allow-list, size limit, 32-byte magic-byte check) into the provider, then `media-service.attach*`
  (create Asset → switch relation → delete old object, in the data-safe order).
- **Delete:** raw `DELETE` routes with CSRF + ownership; **serve:** `/media/...` routes with `canViewAsset` (entitlement) and Range support.
- **Keys:** already server-generated (`media-keys.ts`, UUID-based). **CSRF:** `…WithCsrf` guards on every raw mutation.
- **Limits:** avatar 3 MB, thumbnail 5 MB, resource 50 MB, preview 100 MB, lesson video 500 MB.
- **What actually needed changing:** only the _upload path_ for R2. Reused unchanged: validation (`assertAllowedType`, `assertWithinSizeLimit`),
  key generation, ownership loaders (now exported), signature check, DTOs/URL helpers, delete, serve/Range, access policy.
  Added dependency: `@aws-sdk/s3-request-presigner` (same SDK family; no second storage system).

## 2. New direct-to-R2 architecture

Browser → `POST /api/media/upload-intent` (metadata only) → presigned `PUT` → browser `PUT`s to R2 → `POST /api/media/upload-finalize` (intent id only) → Asset created.
With `STORAGE_PROVIDER=s3` **all five** uploads (thumbnail, preview, lesson video, resource, avatar) use this one flow. With `local`, the server answers `{mode:"server"}`
and the browser uses the original multipart routes.

## 3. Presigned upload design

- Method `PUT`; URL bound to **one server-generated key**; `X-Amz-Expires=600` (10 min); `Content-Type` is a **signed header**; `UNSIGNED-PAYLOAD`.
- Own presign client with `requestChecksumCalculation: "WHEN_REQUIRED"` (recent AWS SDKs otherwise add `x-amz-checksum-*` params that R2 rejects). Main client untouched.
- Browser receives only `{method, url, headers:{Content-Type}, expiresAt}`. No secret key, no bucket-wide permission, no public URL.
- **Caveats (honest):** (a) a SigV4 presigned URL inherently contains the access key **ID** (`X-Amz-Credential`) — never the secret; scope the R2 token to the one bucket.
  (b) **Size is not part of the signature** (chosen to avoid an untested R2 compatibility risk); size is enforced at finalize (mismatch → object deleted).
  (c) Real R2 accepting these URLs: **NOT TESTED**.
- Executed: URL structure asserted (host = storage, path = key, expires 600, content-type signed, no checksum params, secret absent from response).

## 4. Upload-intent design (schema change — why it was necessary)

New table `upload_intents` (`UploadIntent`): `id, userId, purpose, courseId?, lessonId?, storageKey @unique, originalFilename, mimeType, expectedSize, resourceTitle?, expiresAt, finalizedAt?, assetId? @unique, createdAt`.
Existing structures can't do this: finalize must know what the server _promised_ before the object exists (key/size/type/owner/target) and must be single-use; `Asset.storageKey` is only known after finalize.
No foreign keys on purpose (a leftover row must never block deleting users/courses; authorization is re-checked at finalize). Intent TTL 2 h (finalize window; URL itself 10 min);
max 20 open intents per user.

## 5. Finalize verification design

Server loads **its own** intent (scoped to the caller; another user's id behaves like a missing one → 404), rejects expired, re-authorizes (approved instructor, ownership, course still editable),
then `HEAD`s the object: exists; size == `expectedSize`; stored Content-Type == declared (when the store returns one); first 32 bytes match the declared type (ranged read — the file never touches Vercel).
Any mismatch → object **deleted**, nothing saved. The browser never supplies a key (extra `storageKey` field is ignored).

## 6. Idempotency / race handling

One `prisma.$transaction`: `UPDATE upload_intents SET finalizedAt WHERE id AND finalizedAt IS NULL` (single winner; concurrent callers wait on the row lock, then match nothing), then create Asset, switch relation, link `assetId`.
Losers return the existing result. Executed: 6 simultaneous in-process finalizes and 5 parallel HTTP finalizes → one Asset, one LessonResource; duplicate sequential finalize → same asset.
Mutation check: removing the `finalizedAt: null` guard makes the suite fail hard (so the test can detect the bug).

## 7. Replacement-media behaviour

New object is uploaded and verified first; the transaction points the course/lesson/avatar at the new Asset **before** the old Asset row is deleted; the old R2 object is deleted only after commit (failure there leaves an unreferenced object, never a broken page).
A failed replacement (wrong size/type/bytes) leaves the previous media referenced, present and playable. Executed (service and HTTP, including an 80 MB video).

## 8. Orphan cleanup strategy

- **Automatic:** intents expire (2 h); a failed/mismatched finalize deletes its object immediately.
- **Manual (new):** `npm run media:cleanup-intents` (dry run) / `-- --execute`: deletes objects of intents that were **never finalized** and expired > 1 h ago, then the intent rows; never touches finalized uploads or any object an Asset references; counts-only output.
- **Not covered:** nothing is scheduled; objects orphaned by pre-Phase-18 flows or failed old-object deletions have no intent row. Documented in DEPLOYMENT.md.

## 9. CSRF handling

`upload-intent` and `upload-finalize` are raw routes guarded by the existing `requireCurrentUserWithCsrf()` **before** the body is parsed. The browser's PUT to R2 is authorized by the signature (no Learnora CSRF header). DELETE routes unchanged.
Executed over HTTP: no token → 403, wrong token → 403, token minted for another session → 403 (intent, finalize, and DELETE).

## 10. Authorization / ownership

Instructor purposes require an approved instructor (route guard + service defence in depth), course ownership, lesson-belongs-to-course, and an editable course status — re-checked at finalize. Avatars: any signed-in user.
Delete flow unchanged and re-tested. Executed: logged-out 401; pending instructor 403; student 403 (avatar allowed); other instructor 404; wrong-course lesson 404/refused; non-editable course refused.
RBAC for the rest of the app: **CODE REVIEW ONLY** (not touched in Phase 18).

## 11. R2 CORS requirements

Bucket CORS must allow `PUT` from the production origin with header `Content-Type`; no GET/HEAD/exposed headers needed (the browser never reads from R2). Exact JSON and notes are in **DEPLOYMENT.md §5**.
Without this rule browser uploads fail. **CORS against real R2: NOT TESTED.**

## 12. LOCAL storage compatibility

`STORAGE_PROVIDER=local` → `{mode:"server"}`, no intent rows, legacy routes work, LOCAL assets served with Range. Executed (`verify:phase18:local`, 8 checks). Production/Vercel still rejects local storage (Phase 17).
Behaviour change to note: in R2 mode the five legacy upload routes now **refuse** (400) so a large body can never be proxied; executed over HTTP.

## 13. Existing R2 asset compatibility

No keys rewritten, no migration of files. Executed: LOCAL asset served while `STORAGE_PROVIDER=s3` (Phase 16 suite, unchanged and passing); populated-DB migration test kept an existing LOCAL row, an S3 row and the asset-key checksum identical.

## 14. Playback / Range regression

Serving code is unchanged. Executed on directly-uploaded objects: full GET, `Range` 206 with correct `Content-Range`, exact slice, tail seek, deep seek in an 80 MB file, `video/mp4`, `Accept-Ranges`, `nosniff`. Private lesson video still enforced: logged-out 401, unrelated user 403, enrolled student 200/206, owner 200. Resource (7 MB) download intact. Public thumbnail hidden from anonymous while the course is unpublished.

## 15. Security test results (A–W)

| #   | Test                                                                       | Status                                                                                |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| A   | Approved instructor + owned course → intent                                | EXECUTED PASS                                                                         |
| B   | Unapproved instructor denied                                               | EXECUTED PASS (HTTP 403 + service)                                                    |
| C   | Student denied (avatar allowed)                                            | EXECUTED PASS                                                                         |
| D   | Logged-out denied                                                          | EXECUTED PASS (HTTP 401)                                                              |
| E   | Instructor A → Instructor B's course                                       | EXECUTED PASS                                                                         |
| F   | Lesson not in course                                                       | EXECUTED PASS                                                                         |
| G   | Unsupported MIME / disguised / mismatch                                    | EXECUTED PASS                                                                         |
| H   | Oversized metadata refused before any URL (no intent row created)          | EXECUTED PASS                                                                         |
| I   | Tampered/foreign intent, key never client-supplied                         | EXECUTED PASS                                                                         |
| J   | Expired intent                                                             | EXECUTED PASS                                                                         |
| K   | Finalize before object exists                                              | EXECUTED PASS                                                                         |
| L   | Size / Content-Type / magic-byte mismatch (+ object deleted)               | EXECUTED PASS                                                                         |
| M   | Duplicate finalize → one Asset                                             | EXECUTED PASS                                                                         |
| N   | Simultaneous finalize → one Asset                                          | EXECUTED PASS                                                                         |
| O   | Replacement failure keeps old media                                        | EXECUTED PASS                                                                         |
| P   | Delete removes object + DB relation                                        | EXECUTED PASS                                                                         |
| Q   | Cross-instructor / student delete denied                                   | EXECUTED PASS                                                                         |
| R   | Private lesson-video authorization                                         | EXECUTED PASS                                                                         |
| S   | Range playback                                                             | EXECUTED PASS                                                                         |
| T   | Resource download                                                          | EXECUTED PASS                                                                         |
| U   | LOCAL asset behaviour                                                      | EXECUTED PASS                                                                         |
| V   | Secrets absent from client bundle                                          | EXECUTED PASS                                                                         |
| W   | Missing/wrong CSRF rejected                                                | EXECUTED PASS                                                                         |
| —   | Test sensitivity: 3 safety checks deliberately broken → suite fails each   | EXECUTED PASS                                                                         |

## 16. Large-file test results

| Test                                                                                                                                             | Status                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| 80 MB lesson video: intent → PUT to storage URL → finalize → Range playback; app server read **0 KB** while 80 MB went to storage (`/proc/<pid>/io`; control: a 6 MB body sent to the app shows +6.0 MB) | EXECUTED PASS (fake S3)                 |
| 7 MB resource and a small thumbnail/preview/avatar through the same flow                                                                         | EXECUTED PASS (fake S3)                 |
| Frontend does not post file `FormData` to an app endpoint in R2 mode (only inside the `mode:"server"` branch; legacy routes also refuse server-side) | EXECUTED PASS (client run) + CODE REVIEW |
| **REAL R2 LARGE-UPLOAD TEST**                                                                                                                    | **NOT TESTED**                          |
| Real Vercel (4.5 MB limit actually bypassed)                                                                                                     | NOT TESTED                              |

## 17. Regression-suite results (Phase 18 tree, fresh `_test` DB each)

phase10 **104/0**, phase11 **120/0**, phase12 **63/0**, phase15 **73/0**, phase15-security **35/0**, phase16 **86/0** — identical to Phase 17. EXECUTED PASS.
New: phase18 s3 **117/0**, local **8/0**, http **72/0**, client **26/0**. EXECUTED PASS.

## 18. Build / lint / typecheck

- `npm install` EXECUTED PASS. `npm run build` (includes `prisma generate`) EXECUTED PASS — in my sandbox only with a workaround (dummy engine env vars, because `binaries.prisma.sh` is blocked); on your machine `npm run db:generate` is normal. `prisma generate` output verified identical to your bundled client before the schema change.
- `npm run lint`: 0 errors (11 pre-existing warnings). EXECUTED PASS.
- `tsc --noEmit` (no official script): the same 10 pre-existing errors, identical locations; no new ones. New scripts typechecked separately with strict flags.
- `npm audit`: 8 (unchanged from Phase 17; the new presigner dependency adds none).

## 19. Client secret scan

131 client files: zero matches for `SESSION_SECRET`, `DATABASE_URL`, `DIRECT_URL`, `S3_SECRET_ACCESS_KEY`, `S3_ACCESS_KEY_ID`, `S3_ENDPOINT`, `GMAIL_PASS`, `RESEND_API_KEY`, connection strings, `@aws-sdk`, presigner, `getSignedUrl`, `createDirectUpload`, `bcryptjs`, `nodemailer`. EXECUTED PASS. App server log also contained no secrets during all runs.

## 20. Database changes

One additive migration `20261003120000_upload_intents` (one `CREATE TABLE` + 4 indexes). No reset, no drops, no existing table touched. Executed: applies on an empty DB (13/13) and on a **populated** DB with existing LOCAL + S3 assets (row counts and key checksum identical). `prisma migrate deploy` itself and drift check: **BLOCKED** (engine download blocked); SQL follows Prisma naming conventions and `schema.prisma` change is purely additive (0 existing lines changed).

## 21. Files created

`prisma/migrations/20261003120000_upload_intents/migration.sql`, `src/server/media/direct-upload-service.ts`, `src/server/media/direct-upload-errors.ts`, `src/server/repositories/upload-intent-repository.ts`, `src/routes/api.media.upload-intent.ts`, `src/routes/api.media.upload-finalize.ts`, `src/lib/direct-upload.ts`, `scripts/cleanup-upload-intents.ts`, `scripts/verify-phase18.ts`, `scripts/verify-phase18-http.ts`, `scripts/verify-phase18-client.ts`, `PHASE18_REPORT.md` (+ generated `src/generated/prisma/models/UploadIntent.ts`).

## 22. Files modified

`prisma/schema.prisma` (new model only), `package.json`, `package-lock.json` (presigner), `DEPLOYMENT.md`, `README.md`, `src/server/storage/storage-provider.ts`, `src/server/storage/s3-storage-provider.ts`, `src/server/storage/index.ts`, `src/server/media/media-service.ts` (two functions exported), `src/server/media/media-http.ts` (error mapping + small-JSON reader), the five legacy upload routes (`api.instructor.media.thumbnail/preview/lesson-video/lesson-resource`, `api.account.avatar` — one guard line each), `src/components/course/MediaUpload.tsx`, `src/components/account/AvatarUploadField.tsx`, `src/routes/instructor.courses.$courseId.tsx`, and regenerated `src/routeTree.gen.ts` / `src/generated/prisma/*`.

## 23. Files removed

None.

## 24. NOT TESTED / BLOCKED

- Real Cloudflare R2: presigned URL acceptance (signed `Content-Type`), real CORS, real large upload — **NOT TESTED**.
- Real browser: the XHR upload component UI was **not** run in a browser; the client logic was executed in Node with an XHR shim (progress is simulated there; real byte-progress and real CORS behaviour are untested) — **NOT TESTED**.
- Vercel runtime, Neon, `prisma migrate deploy` — NOT TESTED / BLOCKED.
- Admin-side flows, all non-media areas — only via the existing regression suites.

## 25. Remaining limitations / known issues

- Size isn't enforced by the signature; a user with a valid intent could PUT a larger object, which is rejected and deleted at finalize (or removed by cleanup). Bounded by the 20-open-intents cap.
- Only the first 32 bytes are content-checked; **no malware scanning**. Content-Type check is skipped if the store returns none.
- Cleanup is manual; nothing is scheduled.
- Presigned URLs contain the access key ID (not the secret). Use a bucket-scoped R2 token.
- If the R2 token/permissions or CORS are wrong, uploads fail in the browser until fixed (troubleshooting table in DEPLOYMENT.md).
- Pre-existing and unchanged: process-local rate limiter and SSE, simulated payments, 10 pre-existing type errors, 8 dev-only audit findings, no CSP.
- `KNOWN ISSUE — deferred media rendering investigation` is **untouched**; Phase 18 does not claim to fix it, and nothing observed in this phase pointed at its cause.
