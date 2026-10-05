/**
 * Phase 18 HTTP verification — drives a RUNNING production build over real HTTP.
 * Refuses any database whose name does not end in "_test".
 *
 * Orchestration (see DEPLOYMENT.md "Verifying direct uploads locally"): start
 * this script's fake S3 and the built app with the SAME S3_* env, then run it:
 *
 *   BASE_URL=http://127.0.0.1:3100 SERVER_PID=<pid of node .output/server/index.mjs> \
 *   DATABASE_URL=... SESSION_SECRET=... S3_ENDPOINT=http://127.0.0.1:4571 \
 *   S3_REGION=us-east-1 S3_BUCKET=learnora-p18http-bucket S3_ACCESS_KEY_ID=S3RVER \
 *   S3_SECRET_ACCESS_KEY=... STORAGE_PROVIDER=s3 npx tsx scripts/verify-phase18-http.ts
 *
 * Linux only for the "bytes did not pass through the app" measurement (/proc/<pid>/io).
 * S3 is `s3rver` (a FAKE S3): this is NOT a real Cloudflare R2 test.
 */
import { readFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error s3rver ships no type declarations
import S3rver from "s3rver";

const dbName = new URL(process.env["DATABASE_URL"] ?? "postgresql://x/none").pathname.slice(1);
if (!dbName.endsWith("_test")) {
  console.error(`Refusing to run: database "${dbName}" does not end with "_test".`);
  process.exit(2);
}
const BASE = process.env["BASE_URL"] ?? "http://127.0.0.1:3100";
const SERVER_PID = process.env["SERVER_PID"];
const S3_PORT = Number(new URL(process.env["S3_ENDPOINT"] ?? "http://127.0.0.1:4571").port);

let passed = 0;
let failed = 0;
const failures: string[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  FAIL  ${name} ${detail}`);
  }
};
const section = (t: string) => console.log(`\n== ${t}`);

type Intent = {
  mode: string;
  intentId: string;
  upload: { url: string; headers: Record<string, string> };
};

function fakeMp4(size: number): Buffer {
  const b = Buffer.alloc(size, 0x61);
  b.writeUInt32BE(0x20, 0);
  b.write("ftypisom", 4, "latin1");
  return b;
}
function fakePng(size: number): Buffer {
  const b = Buffer.alloc(size, 0x62);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  return b;
}
function fakePdf(size: number): Buffer {
  const b = Buffer.alloc(size, 0x63);
  b.write("%PDF-1.4\n", 0, "latin1");
  return b;
}
const rchar = () =>
  Number(/rchar: (\d+)/.exec(readFileSync(`/proc/${SERVER_PID}/io`, "utf8"))?.[1] ?? NaN);

async function main() {
  const { prisma } = await import("../src/server/db/client");
  const { generateOpaqueToken, hashOpaqueToken } = await import("../src/server/auth/tokens");
  const { deriveCsrfToken } = await import("../src/server/auth/csrf");
  const { getStorageProviderFor } = await import("../src/server/storage");

  type Actor = { raw: string; csrf: string; id: string };
  async function login(email: string): Promise<Actor> {
    const u = await prisma.user.findUniqueOrThrow({ where: { email } });
    const raw = generateOpaqueToken();
    await prisma.session.create({
      data: {
        userId: u.id,
        tokenHash: hashOpaqueToken(raw),
        expiresAt: new Date(Date.now() + 3600e3),
      },
    });
    return { raw, csrf: deriveCsrfToken(raw), id: u.id };
  }
  const elena = await login("elena.vasquez@learnora.dev");
  const marcus = await login("marcus.chen@learnora.dev");
  const priyanka = await login("priyanka.das@learnora.dev"); // PENDING instructor
  const sara = await login("sara.khan@learnora.dev");
  const james = await login("james.oconnor@learnora.dev"); // enrolled in modern-react-typescript

  async function call(
    method: string,
    path: string,
    opts: {
      actor?: Actor;
      csrf?: string | null;
      json?: unknown;
      raw?: BodyInit;
      contentType?: string;
    } = {},
  ) {
    const headers: Record<string, string> = {};
    if (opts.actor) headers["cookie"] = `learnora_session=${opts.actor.raw}`;
    const csrf = opts.csrf === undefined ? opts.actor?.csrf : opts.csrf;
    if (csrf) headers["x-csrf-token"] = csrf;
    let body: BodyInit | undefined = opts.raw;
    if (opts.json !== undefined) {
      headers["content-type"] = opts.contentType ?? "application/json";
      body = JSON.stringify(opts.json);
    }
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      ...(body !== undefined && { body }),
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not json */
    }
    return {
      status: res.status,
      json: json as Record<string, unknown> | null,
      text,
      headers: res.headers,
    };
  }

  // fixtures ---------------------------------------------------------------
  async function editableCourseOf(instructorEmail: string, status: "DRAFT" | "REJECTED") {
    const u = await prisma.user.findUniqueOrThrow({ where: { email: instructorEmail } });
    const course = await prisma.course.findFirstOrThrow({ where: { instructorId: u.id, status } });
    let section = await prisma.courseSection.findFirst({ where: { courseId: course.id } });
    section ??= await prisma.courseSection.create({
      data: { courseId: course.id, title: "s", position: 99 },
    });
    let lesson = await prisma.lesson.findFirst({ where: { sectionId: section.id } });
    lesson ??= await prisma.lesson.create({
      data: { sectionId: section.id, title: "l", type: "VIDEO", position: 99 },
    });
    return { course, lesson };
  }
  const E = await editableCourseOf("elena.vasquez@learnora.dev", "REJECTED");
  const M = await editableCourseOf("marcus.chen@learnora.dev", "DRAFT");

  const server = new S3rver({
    port: S3_PORT,
    address: "127.0.0.1",
    silent: true,
    directory: mkdtempSync(join(tmpdir(), "learnora-p18http-")),
    configureBuckets: [
      { name: process.env["S3_BUCKET"] ?? "learnora-p18http-bucket", configs: [] },
    ],
  });
  await server.run();
  try {
    const s3 = getStorageProviderFor("S3");
    const exists = (key: string) =>
      s3.stat(key).then(
        () => true,
        () => false,
      );
    const intentBody = (extra: Record<string, unknown> = {}) => ({
      purpose: "COURSE_THUMBNAIL",
      courseId: E.course.id,
      filename: "t.png",
      mimeType: "image/png",
      sizeBytes: 1000,
      ...extra,
    });
    const put = async (intent: Intent, body: Buffer) =>
      (
        await fetch(intent["upload"].url, {
          method: "PUT",
          headers: intent["upload"].headers,
          body: new Uint8Array(body),
        })
      ).status;

    // ------------------------------------------------ authn / authz / CSRF
    section("Authentication, authorization, CSRF on the new routes (D, B, C, W)");
    const anon = await call("POST", "/api/media/upload-intent", { json: intentBody() });
    check("D: logged-out intent -> 401", anon.status === 401);
    check(
      "D: logged-out finalize -> 401",
      (await call("POST", "/api/media/upload-finalize", { json: { intentId: "x" } })).status ===
        401,
    );
    check(
      "W: session but NO csrf header (intent) -> 403",
      (
        await call("POST", "/api/media/upload-intent", {
          actor: elena,
          csrf: null,
          json: intentBody(),
        })
      ).status === 403,
    );
    check(
      "W: session + WRONG csrf (intent) -> 403",
      (
        await call("POST", "/api/media/upload-intent", {
          actor: elena,
          csrf: "deadbeef",
          json: intentBody(),
        })
      ).status === 403,
    );
    check(
      "W: session + csrf minted for ANOTHER session -> 403",
      (
        await call("POST", "/api/media/upload-intent", {
          actor: elena,
          csrf: marcus.csrf,
          json: intentBody(),
        })
      ).status === 403,
    );
    check(
      "W: NO csrf header (finalize) -> 403",
      (
        await call("POST", "/api/media/upload-finalize", {
          actor: elena,
          csrf: null,
          json: { intentId: "x" },
        })
      ).status === 403,
    );
    check(
      "W: WRONG csrf (finalize) -> 403",
      (
        await call("POST", "/api/media/upload-finalize", {
          actor: elena,
          csrf: "nope",
          json: { intentId: "x" },
        })
      ).status === 403,
    );
    check(
      "B: PENDING instructor -> 403",
      (await call("POST", "/api/media/upload-intent", { actor: priyanka, json: intentBody() }))
        .status === 403,
    );
    check(
      "C: student asking for course media -> 403",
      (await call("POST", "/api/media/upload-intent", { actor: sara, json: intentBody() }))
        .status === 403,
    );
    const stuAvatar = await call("POST", "/api/media/upload-intent", {
      actor: sara,
      json: { purpose: "AVATAR", filename: "a.png", mimeType: "image/png", sizeBytes: 500 },
    });
    check(
      "student AVATAR intent -> 200 direct",
      stuAvatar.status === 200 && stuAvatar.json?.["mode"] === "direct",
    );
    check(
      "E: instructor B on instructor A's course -> 404",
      (await call("POST", "/api/media/upload-intent", { actor: marcus, json: intentBody() }))
        .status === 404,
    );
    check(
      "non-JSON content type -> 400",
      (
        await call("POST", "/api/media/upload-intent", {
          actor: elena,
          json: intentBody(),
          contentType: "text/plain",
        })
      ).status === 400,
    );
    check(
      "malformed JSON -> 400",
      (await call("POST", "/api/media/upload-intent", { actor: elena, raw: "{nope" })).status ===
        400,
    );
    check(
      "G: unsupported MIME -> 400",
      (
        await call("POST", "/api/media/upload-intent", {
          actor: elena,
          json: intentBody({ mimeType: "text/html", filename: "x.html" }),
        })
      ).status === 400,
    );
    check(
      "H: oversized declared size -> 400 (before any URL)",
      (
        await call("POST", "/api/media/upload-intent", {
          actor: elena,
          json: intentBody({ sizeBytes: 6 * 1024 * 1024 }),
        })
      ).status === 400,
    );
    check(
      "F: lesson from another course -> 404",
      (
        await call("POST", "/api/media/upload-intent", {
          actor: elena,
          json: {
            purpose: "LESSON_VIDEO",
            courseId: E.course.id,
            lessonId: M.lesson.id,
            filename: "v.mp4",
            mimeType: "video/mp4",
            sizeBytes: 100,
          },
        })
      ).status === 404,
    );

    // ---------------------------------------- legacy routes refuse in R2 mode
    section("Legacy multipart routes must not proxy files in R2 mode");
    const fd = () => {
      const f = new FormData();
      f.append("file", new Blob([new Uint8Array(fakePng(500))], { type: "image/png" }), "t.png");
      return f;
    };
    for (const [label, path, actor] of [
      ["thumbnail", `/api/instructor/media/thumbnail/${E.course.id}`, elena],
      ["preview", `/api/instructor/media/preview/${E.course.id}`, elena],
      ["lesson-video", `/api/instructor/media/lesson-video/${E.course.id}/${E.lesson.id}`, elena],
      [
        "lesson-resource",
        `/api/instructor/media/lesson-resource/${E.course.id}/${E.lesson.id}`,
        elena,
      ],
      ["avatar", "/api/account/avatar", sara],
    ] as const) {
      const r = await call("POST", path, { actor, raw: fd() });
      check(
        `legacy ${label} POST -> 400 'directly to storage'`,
        r.status === 400 && String(r.json?.["error"]).includes("directly to storage"),
        `status=${r.status}`,
      );
    }
    const pre = await prisma.asset.count();
    check("legacy refusals created no assets", pre === (await prisma.asset.count()));

    // ---------------------------------------------- happy path + idempotency
    section("Intent -> PUT to storage -> finalize over HTTP");
    const i1 = (
      await call("POST", "/api/media/upload-intent", { actor: elena, json: intentBody() })
    ).json as Intent;
    const putHost = new URL(i1["upload"].url).host;
    check(
      "intent URL host is the STORAGE host, not the app",
      putHost === `127.0.0.1:${S3_PORT}` && putHost !== new URL(BASE).host,
    );
    check(
      "intent response carries no secret/key fields",
      !JSON.stringify(i1).includes(process.env["S3_SECRET_ACCESS_KEY"] ?? "@@") &&
        !("storageKey" in i1),
    );
    const early = await call("POST", "/api/media/upload-finalize", {
      actor: elena,
      json: { intentId: i1["intentId"] },
    });
    check("K: finalize before the PUT -> 400", early.status === 400);
    check("PUT straight to storage -> 200", (await put(i1, fakePng(1000))) === 200);
    const fin = await call("POST", "/api/media/upload-finalize", {
      actor: elena,
      json: { intentId: i1["intentId"] },
    });
    check(
      "finalize -> 200 with an asset",
      fin.status === 200 && typeof fin.json?.["assetId"] === "string",
    );
    const again = await call("POST", "/api/media/upload-finalize", {
      actor: elena,
      json: { intentId: i1["intentId"] },
    });
    check(
      "M: duplicate finalize -> 200, same asset",
      again.status === 200 && again.json?.["assetId"] === fin.json?.["assetId"],
    );
    const par = await Promise.all(
      Array.from({ length: 5 }, () =>
        call("POST", "/api/media/upload-finalize", {
          actor: elena,
          json: { intentId: i1["intentId"] },
        }),
      ),
    );
    check(
      "N: 5 parallel finalizes -> all 200, same asset",
      par.every((r) => r.status === 200 && r.json?.["assetId"] === fin.json?.["assetId"]),
    );
    const intentRow = await prisma.uploadIntent.findUniqueOrThrow({
      where: { id: i1["intentId"] },
    });
    check(
      "N: exactly one Asset row for the key",
      (await prisma.asset.count({ where: { storageKey: intentRow.storageKey } })) === 1,
    );
    check(
      "I: another user finalizing my intent id -> 404",
      (
        await call("POST", "/api/media/upload-finalize", {
          actor: marcus,
          json: { intentId: i1["intentId"] },
        })
      ).status === 404,
    );
    check(
      "I: a client-supplied storageKey field is ignored (strict intent-id only)",
      (
        await call("POST", "/api/media/upload-finalize", {
          actor: elena,
          json: { intentId: i1["intentId"], storageKey: "avatars/x/y.png" },
        })
      ).status === 200,
    );
    const pub = await call("GET", `/media/public/${fin.json?.["assetId"]}`, { actor: elena });
    check("thumbnail served by the app's authorized route", pub.status === 200);
    check(
      "thumbnail NOT public while course is not published (anon -> denied)",
      [401, 403].includes((await call("GET", `/media/public/${fin.json?.["assetId"]}`)).status),
    );

    // --------------------------------- the point of Phase 18: large file path
    section("Large file: bytes go to storage, NOT through the app server");
    if (!SERVER_PID) {
      console.log("  (SERVER_PID not given — skipping the /proc measurement)");
    } else {
      const bodyPad = "x".repeat(6 * 1024 * 1024);
      const c0 = rchar();
      await call("POST", "/api/media/upload-intent", {
        actor: elena,
        json: { ...intentBody(), pad: bodyPad },
      });
      const control = rchar() - c0;
      check(
        `measurement control: a 6 MB body sent TO the app is visible (+${(control / 1048576).toFixed(1)} MB read)`,
        control > 5 * 1024 * 1024,
      );

      const big = fakeMp4(80 * 1024 * 1024);
      const bi = (
        await call("POST", "/api/media/upload-intent", {
          actor: elena,
          json: {
            purpose: "LESSON_VIDEO",
            courseId: E.course.id,
            lessonId: E.lesson.id,
            filename: "big.mp4",
            mimeType: "video/mp4",
            sizeBytes: big.length,
          },
        })
      ).json as Intent;
      check("80 MB intent accepted (over Vercel's 4.5 MB body limit)", bi["mode"] === "direct");
      const before = rchar();
      const putStatus = await put(bi, big);
      const after = rchar();
      const appRead = after - before;
      check("80 MB PUT to storage -> 200", putStatus === 200);
      check(
        `app server read only ${(appRead / 1024).toFixed(0)} KB while 80 MB went to storage (< 1 MB)`,
        appRead < 1024 * 1024,
      );
      const bf = await call("POST", "/api/media/upload-finalize", {
        actor: elena,
        json: { intentId: bi["intentId"] },
      });
      check("80 MB lesson video finalized", bf.status === 200);
      const bigAsset = await prisma.asset.findUniqueOrThrow({
        where: { id: String(bf.json?.["assetId"]) },
      });
      check(
        "finalized size equals the file size",
        bigAsset.sizeBytes === big.length && bigAsset.storageProvider === "S3",
      );

      section("Playback of the large direct-uploaded lesson video (R, S)");
      const vid = `/media/lesson-video/${bigAsset.id}`;
      check("R: logged-out -> denied (401)", (await call("GET", vid)).status === 401);
      check(
        "R: unrelated instructor -> denied (403)",
        (await call("GET", vid, { actor: marcus })).status === 403,
      );
      const rangeRes = await fetch(`${BASE}${vid}`, {
        headers: { cookie: `learnora_session=${elena.raw}`, range: "bytes=70000000-70000999" },
      });
      const rangeBody = Buffer.from(await rangeRes.arrayBuffer());
      check("S: owner Range request deep in the file -> 206", rangeRes.status === 206);
      check(
        "S: Content-Range correct",
        rangeRes.headers.get("content-range") === `bytes 70000000-70000999/${big.length}`,
      );
      check("S: exact slice returned", rangeBody.equals(big.subarray(70000000, 70001000)));
      check(
        "S: Content-Type video/mp4 and Accept-Ranges",
        rangeRes.headers.get("content-type") === "video/mp4" &&
          rangeRes.headers.get("accept-ranges") === "bytes",
      );

      // replacement over HTTP: old object removed only after the switch
      const oldKey = bigAsset.storageKey;
      const small = fakeMp4(200_000);
      const si = (
        await call("POST", "/api/media/upload-intent", {
          actor: elena,
          json: {
            purpose: "LESSON_VIDEO",
            courseId: E.course.id,
            lessonId: E.lesson.id,
            filename: "v2.mp4",
            mimeType: "video/mp4",
            sizeBytes: small.length,
          },
        })
      ).json as Intent;
      await put(si, fakeMp4(100));
      const bad = await call("POST", "/api/media/upload-finalize", {
        actor: elena,
        json: { intentId: si["intentId"] },
      });
      check("O: failed replacement (wrong size) -> 400", bad.status === 400);
      check(
        "O: previous 80 MB video still referenced and in storage",
        (await exists(oldKey)) &&
          (await prisma.lesson.findUniqueOrThrow({ where: { id: E.lesson.id } })).videoAssetId ===
            bigAsset.id,
      );
      check(
        "O: previous video still plays (Range 206)",
        (await fetch(`${BASE}${vid}`, {
          headers: { cookie: `learnora_session=${elena.raw}`, range: "bytes=0-99" },
        }).then(async (r) => {
          await r.arrayBuffer();
          return r.status;
        })) === 206,
      );
      const si2 = (
        await call("POST", "/api/media/upload-intent", {
          actor: elena,
          json: {
            purpose: "LESSON_VIDEO",
            courseId: E.course.id,
            lessonId: E.lesson.id,
            filename: "v2.mp4",
            mimeType: "video/mp4",
            sizeBytes: small.length,
          },
        })
      ).json as Intent;
      await put(si2, small);
      const ok2 = await call("POST", "/api/media/upload-finalize", {
        actor: elena,
        json: { intentId: si2["intentId"] },
      });
      check("O: successful replacement -> 200", ok2.status === 200);
      check("O: old object removed from storage after the switch", !(await exists(oldKey)));
      check(
        "O: old Asset row removed",
        (await prisma.asset.findUnique({ where: { id: bigAsset.id } })) === null,
      );
      const newVidId = String(ok2.json?.["assetId"]);

      // entitlement on a PUBLISHED course (enrolled / not enrolled) using an S3-backed asset
      section("Private lesson-video entitlement still enforced (R)");
      const modern = await prisma.course.findFirstOrThrow({
        where: { slug: "modern-react-typescript" },
      });
      const lessonRow = await prisma.lesson.findFirstOrThrow({
        where: { section: { courseId: modern.id }, isPreview: false },
      });
      const entKey = `p18http/entitlement-${Date.now()}.mp4`;
      const entBytes = fakeMp4(150_000);
      await s3.save(entKey, entBytes);
      const entAsset = await prisma.asset.create({
        data: {
          ownerId: modern.instructorId,
          storageProvider: "S3",
          storageKey: entKey,
          originalFilename: "e.mp4",
          mimeType: "video/mp4",
          sizeBytes: entBytes.length,
          purpose: "LESSON_VIDEO",
        },
      });
      const prevVideo = lessonRow.videoAssetId;
      await prisma.lesson.update({
        where: { id: lessonRow.id },
        data: { videoAssetId: entAsset.id },
      });
      const ev = `/media/lesson-video/${entAsset.id}`;
      check("R: enrolled student -> 200", (await call("GET", ev, { actor: james })).status === 200);
      const er = await fetch(`${BASE}${ev}`, {
        headers: { cookie: `learnora_session=${james.raw}`, range: "bytes=1000-1999" },
      });
      check(
        "S: enrolled student Range -> 206 exact slice",
        er.status === 206 &&
          Buffer.from(await er.arrayBuffer()).equals(entBytes.subarray(1000, 2000)),
      );
      check(
        "R: unrelated user (not enrolled) -> 403",
        (await call("GET", ev, { actor: marcus })).status === 403,
      );
      check("R: logged-out -> 401", (await call("GET", ev)).status === 401);
      await prisma.lesson.update({
        where: { id: lessonRow.id },
        data: { videoAssetId: prevVideo },
      });
      await prisma.asset.delete({ where: { id: entAsset.id } });
      await s3.delete(entKey);

      // resource upload > 4.5 MB straight to storage, then download
      section("Resource > 4.5 MB (T) and delete flow (P, Q)");
      const pdf = fakePdf(7 * 1024 * 1024);
      const ri = (
        await call("POST", "/api/media/upload-intent", {
          actor: elena,
          json: {
            purpose: "LESSON_RESOURCE",
            courseId: E.course.id,
            lessonId: E.lesson.id,
            filename: "guide.pdf",
            mimeType: "application/pdf",
            sizeBytes: pdf.length,
            title: "Guide",
          },
        })
      ).json as Intent;
      check("7 MB resource: direct PUT -> 200", (await put(ri, pdf)) === 200);
      const rf = await call("POST", "/api/media/upload-finalize", {
        actor: elena,
        json: { intentId: ri["intentId"] },
      });
      check(
        "resource finalize -> 200 with downloadUrl",
        rf.status === 200 && String(rf.json?.["downloadUrl"]).startsWith("/media/resource/"),
      );
      const dl = await fetch(`${BASE}${rf.json?.["downloadUrl"]}`, {
        headers: { cookie: `learnora_session=${elena.raw}` },
      });
      check(
        "T: owner downloads the 7 MB resource intact",
        dl.status === 200 && Buffer.from(await dl.arrayBuffer()).equals(pdf),
      );
      check(
        "T: logged-out resource download -> 401",
        (await call("GET", String(rf.json?.["downloadUrl"]))).status === 401,
      );

      const delVid = `/api/instructor/media/lesson-video/${E.course.id}/${E.lesson.id}`;
      check(
        "W: DELETE without csrf -> 403",
        (await call("DELETE", delVid, { actor: elena, csrf: null })).status === 403,
      );
      check(
        "Q: other instructor DELETE -> 404",
        (await call("DELETE", delVid, { actor: marcus })).status === 404,
      );
      check(
        "Q: student DELETE -> 403",
        (await call("DELETE", delVid, { actor: sara })).status === 403,
      );
      check("Q: logged-out DELETE -> 401", (await call("DELETE", delVid)).status === 401);
      check(
        "Q: refused deletes left the video intact",
        (await prisma.asset.count({ where: { id: newVidId } })) === 1,
      );
      const newAsset = await prisma.asset.findUniqueOrThrow({ where: { id: newVidId } });
      check(
        "P: owner DELETE -> 200",
        (await call("DELETE", delVid, { actor: elena })).status === 200,
      );
      check(
        "P: R2 object deleted and DB cleared",
        !(await exists(newAsset.storageKey)) &&
          (await prisma.lesson.findUniqueOrThrow({ where: { id: E.lesson.id } })).videoAssetId ===
            null,
      );
      const resRow = await prisma.lessonResource.findFirstOrThrow({
        where: { lessonId: E.lesson.id },
      });
      const resAsset = await prisma.asset.findUniqueOrThrow({ where: { id: resRow.assetId } });
      check(
        "Q: other instructor cannot delete my resource",
        (
          await call(
            "DELETE",
            `/api/instructor/media/resource/${E.course.id}/${E.lesson.id}/${resRow.id}`,
            { actor: marcus },
          )
        ).status === 404,
      );
      check(
        "P: owner deletes resource -> 200, object gone",
        (
          await call(
            "DELETE",
            `/api/instructor/media/resource/${E.course.id}/${E.lesson.id}/${resRow.id}`,
            { actor: elena },
          )
        ).status === 200 && !(await exists(resAsset.storageKey)),
      );
      check(
        "P: thumbnail DELETE -> 200",
        (await call("DELETE", `/api/instructor/media/thumbnail/${E.course.id}`, { actor: elena }))
          .status === 200,
      );
    }

    // ------------------------------------------------------ security headers
    section("Headers");
    const h = await call("POST", "/api/media/upload-intent", { actor: elena, json: intentBody() });
    check("intent response is no-store", h.headers.get("cache-control") === "no-store");
    check(
      "security headers present on API responses",
      h.headers.get("x-content-type-options") === "nosniff" &&
        h.headers.get("x-frame-options") === "DENY",
    );
  } finally {
    await server.close();
  }
  await prisma.$disconnect();
}

main()
  .catch((e) => {
    failed++;
    failures.push("UNCAUGHT: " + (e instanceof Error ? e.stack : String(e)));
    console.error(e);
  })
  .finally(() => {
    console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
    if (failures.length) console.log("Failures:\n - " + failures.join("\n - "));
    process.exit(failed ? 1 : 0);
  });
