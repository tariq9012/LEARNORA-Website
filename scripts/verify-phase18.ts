/**
 * Phase 18 verification — direct-to-R2 uploads (service level, real PostgreSQL).
 * Refuses any database whose name does not end in "_test".
 *
 * Run twice (each process has its own cached env):
 *   npx tsx scripts/verify-phase18.ts          # STORAGE_PROVIDER=s3 (direct upload)
 *   npx tsx scripts/verify-phase18.ts local    # STORAGE_PROVIDER=local (server-mediated)
 *
 * Needs a freshly migrated + seeded `_test` database:
 *   DATABASE_URL=... DIRECT_URL=... SESSION_SECRET=<32+ chars> npx tsx scripts/verify-phase18.ts
 *
 * HONESTY NOTE: S3 behaviour is exercised against `s3rver`, a local FAKE S3
 * server. It proves our code's logic and the S3 wire behaviour we rely on. It
 * does NOT validate SigV4 signatures (s3rver accepts any signature), so it says
 * nothing about whether Cloudflare R2 accepts our presigned URLs. That is
 * "REAL R2 — NOT TESTED".
 */
import { randomBytes } from "node:crypto";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
// @ts-expect-error s3rver ships no type declarations
import S3rver from "s3rver";

const dbName = new URL(process.env["DATABASE_URL"] ?? "postgresql://x/none").pathname.slice(1);
if (!dbName.endsWith("_test")) {
  console.error(`Refusing to run: database "${dbName}" does not end with "_test".`);
  process.exit(2);
}

const LOCAL_MODE = process.argv[2] === "local";
const S3_PORT = 4570;
const scratch = mkdtempSync(join(tmpdir(), "learnora-p18-"));
process.env["LOCAL_STORAGE_ROOT"] = join(scratch, "local");
if (LOCAL_MODE) {
  process.env["STORAGE_PROVIDER"] = "local";
} else {
  process.env["STORAGE_PROVIDER"] = "s3";
  process.env["S3_ENDPOINT"] = `http://127.0.0.1:${S3_PORT}`;
  process.env["S3_REGION"] = "us-east-1";
  process.env["S3_BUCKET"] = "learnora-p18-bucket";
  process.env["S3_ACCESS_KEY_ID"] = "S3RVER";
  process.env["S3_SECRET_ACCESS_KEY"] = "p18-secret-must-never-leak-0123456789";
}

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
async function throws(fn: () => Promise<unknown> | unknown): Promise<unknown> {
  try {
    await fn();
    return null;
  } catch (e) {
    return e ?? new Error("threw");
  }
}

// ---- fixtures: tiny files with valid magic bytes ---------------------------
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

async function main() {
  const { prisma } = await import("../src/server/db/client");
  const direct = await import("../src/server/media/direct-upload-service");
  const errors = await import("../src/server/media/direct-upload-errors");
  const mediaService = await import("../src/server/media/media-service");
  const { getStorageProviderFor } = await import("../src/server/storage");
  const { serveAssetResponse } = await import("../src/server/media/media-serve");
  const { FileSignatureError } = await import("../src/server/media/file-signature");
  const { MediaValidationError } = await import("../src/server/media/media-config");
  const { ForbiddenError } = await import("../src/server/auth/guards");

  // ---------------------------------------------------------------- actors
  async function userByEmail(email: string) {
    const u = await prisma.user.findUniqueOrThrow({ where: { email } });
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      avatarUrl: null,
      role: u.role,
      status: u.status,
    } as const;
  }
  async function approvedInstructor(email: string) {
    const u = await userByEmail(email);
    const profile = await prisma.instructorProfile.findUniqueOrThrow({ where: { userId: u.id } });
    return { ...u, instructorProfileId: profile.id };
  }
  const elena = await approvedInstructor("elena.vasquez@learnora.dev");
  const marcus = await approvedInstructor("marcus.chen@learnora.dev");
  const priyanka = await userByEmail("priyanka.das@learnora.dev"); // PENDING instructor
  const student = await userByEmail("sara.khan@learnora.dev");

  // Editable courses (DRAFT / REJECTED). Ensure each has a section + lesson.
  async function editableCourseOf(instructorId: string, status: "DRAFT" | "REJECTED") {
    const course = await prisma.course.findFirstOrThrow({ where: { instructorId, status } });
    let section = await prisma.courseSection.findFirst({ where: { courseId: course.id } });
    section ??= await prisma.courseSection.create({
      data: { courseId: course.id, title: "P18 section", position: 99 },
    });
    let lesson = await prisma.lesson.findFirst({ where: { sectionId: section.id } });
    lesson ??= await prisma.lesson.create({
      data: { sectionId: section.id, title: "P18 lesson", type: "VIDEO", position: 99 },
    });
    return { course, lesson };
  }
  const elenaCourse = await editableCourseOf(elena.id, "REJECTED");
  const marcusCourse = await editableCourseOf(marcus.id, "DRAFT");
  const elenaPublished = await prisma.course.findFirstOrThrow({
    where: { instructorId: elena.id, status: "PUBLISHED" },
  });

  // ============================================================== LOCAL MODE
  if (LOCAL_MODE) {
    section("STORAGE_PROVIDER=local keeps the server-mediated flow");
    const r = await direct.createUploadIntent(elena, {
      purpose: "COURSE_THUMBNAIL",
      courseId: elenaCourse.course.id,
      filename: "t.png",
      mimeType: "image/png",
      sizeBytes: 100,
    });
    check("local mode: intent answers { mode: 'server' } (no presigned URL)", r.mode === "server");
    check(
      "local mode: direct upload is reported disabled",
      direct.isDirectUploadEnabled() === false,
    );
    check(
      "local mode: legacy multipart routes are NOT blocked",
      (await throws(() => direct.assertServerMediatedUploadAllowed())) === null,
    );
    check(
      "local mode: student still cannot request a course-media intent",
      (await throws(() =>
        direct.createUploadIntent(student, {
          purpose: "COURSE_THUMBNAIL",
          courseId: elenaCourse.course.id,
          filename: "t.png",
          mimeType: "image/png",
          sizeBytes: 100,
        }),
      )) instanceof ForbiddenError,
    );
    const rows = await prisma.uploadIntent.count({ where: { userId: elena.id } });
    check("local mode: no UploadIntent row is created", rows === 0);
    check(
      "local mode: finalize refuses (nothing to finalize)",
      (await throws(() =>
        direct.finalizeUpload({
          user: elena,
          intentId: "nope",
          resolveInstructor: async () => elena,
        }),
      )) instanceof errors.UploadNotFoundError,
    );

    // An existing LOCAL asset is still served.
    const key = `p18/local-${Date.now()}.png`;
    const bytes = fakePng(2048);
    const abs = join(process.env["LOCAL_STORAGE_ROOT"] as string, key);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, bytes);
    const asset = await prisma.asset.create({
      data: {
        ownerId: elena.id,
        storageProvider: "LOCAL",
        storageKey: key,
        originalFilename: "l.png",
        mimeType: "image/png",
        sizeBytes: bytes.length,
        purpose: "COURSE_THUMBNAIL",
      },
    });
    const res = await serveAssetResponse(asset.id, new Request("http://x/m"));
    check(
      "existing LOCAL asset still served in local mode",
      res.status === 200 && Buffer.from(await res.arrayBuffer()).equals(bytes),
    );
    const part = await serveAssetResponse(
      asset.id,
      new Request("http://x/m", { headers: { Range: "bytes=0-99" } }),
    );
    check("LOCAL asset Range -> 206", part.status === 206);
    await prisma.asset.delete({ where: { id: asset.id } });
    return;
  }

  // ================================================================ S3 MODE
  const server = new S3rver({
    port: S3_PORT,
    address: "127.0.0.1",
    silent: true,
    directory: join(scratch, "s3"),
    configureBuckets: [{ name: "learnora-p18-bucket", configs: [] }],
  });
  await server.run();
  try {
    const s3 = getStorageProviderFor("S3");
    const exists = async (key: string) =>
      s3
        .stat(key)
        .then(() => true)
        .catch(() => false);
    const finalize = (
      user: typeof elena | typeof student,
      instructor: typeof elena,
      intentId: string,
      now?: Date,
    ) =>
      direct.finalizeUpload({
        user,
        intentId,
        resolveInstructor: async () => instructor,
        ...(now && { now }),
      });

    type Intent = Extract<
      Awaited<ReturnType<typeof direct.createUploadIntent>>,
      { mode: "direct" }
    >;
    async function newIntent(
      actor: typeof elena,
      input: Parameters<typeof direct.createUploadIntent>[1],
      now?: Date,
    ): Promise<Intent> {
      const r = await direct.createUploadIntent(actor, input, now);
      if (r.mode !== "direct") throw new Error("expected direct mode");
      return r;
    }
    async function putTo(intent: Intent, body: Buffer, headers?: Record<string, string>) {
      const res = await fetch(intent.upload.url, {
        method: "PUT",
        headers: headers ?? intent.upload.headers,
        body: new Uint8Array(body),
      });
      return res.status;
    }
    const keyOf = async (intentId: string) =>
      (await prisma.uploadIntent.findUniqueOrThrow({ where: { id: intentId } })).storageKey;

    const thumbInput = (courseId: string, size: number, extra = {}) => ({
      purpose: "COURSE_THUMBNAIL" as const,
      courseId,
      filename: "thumb.png",
      mimeType: "image/png",
      sizeBytes: size,
      ...extra,
    });

    // ------------------------------------------------ presigned URL design
    section("Presigned upload design (structure)");
    const t1 = await newIntent(elena, thumbInput(elenaCourse.course.id, 1000));
    const u = new URL(t1.upload.url);
    const key1 = await keyOf(t1.intentId);
    check("mode is direct and method is PUT", t1.mode === "direct" && t1.upload.method === "PUT");
    check("URL points at the S3/R2 endpoint, not the app", u.host === `127.0.0.1:${S3_PORT}`);
    check("URL path is bound to the one server-generated key", u.pathname.endsWith(`/${key1}`));
    check(
      "key is server-generated under courses/<courseId>/thumbnail/",
      key1.startsWith(`courses/${elenaCourse.course.id}/thumbnail/`),
    );
    check("URL expires in about 10 minutes", Number(u.searchParams.get("X-Amz-Expires")) === 600);
    check(
      "Content-Type is part of the signature",
      (u.searchParams.get("X-Amz-SignedHeaders") ?? "").split(";").includes("content-type"),
    );
    check("no checksum params (R2-compatible)", !/checksum/i.test(t1.upload.url));
    check(
      "secret access key appears nowhere in the intent response",
      !JSON.stringify(t1).includes("p18-secret-must-never-leak-0123456789"),
    );
    check(
      "response has no storageKey / bucket / credentials fields",
      !("storageKey" in t1) && !JSON.stringify(t1).toLowerCase().includes("secret"),
    );
    const row1 = await prisma.uploadIntent.findUniqueOrThrow({ where: { id: t1.intentId } });
    check(
      "intent row stores expected size/type/owner",
      row1.expectedSize === 1000 && row1.mimeType === "image/png" && row1.userId === elena.id,
    );
    check("no object exists in R2 before the browser uploads", !(await exists(key1)));
    check(
      "no Asset exists before finalize",
      (await prisma.asset.count({ where: { storageKey: key1 } })) === 0,
    );

    // ----------------------------------------------------- A-H authorization
    section("Intent authorization & validation (A–H)");
    check("A: approved instructor + owned course -> allowed", t1.mode === "direct");
    for (const [purpose, extra, name, mime, size] of [
      ["COURSE_PREVIEW", {}, "p.mp4", "video/mp4", 5000],
      ["LESSON_VIDEO", { lessonId: elenaCourse.lesson.id }, "v.mp4", "video/mp4", 5000],
      [
        "LESSON_RESOURCE",
        { lessonId: elenaCourse.lesson.id, title: "Notes" },
        "n.pdf",
        "application/pdf",
        5000,
      ],
    ] as const) {
      const r = await direct.createUploadIntent(elena, {
        purpose,
        courseId: elenaCourse.course.id,
        filename: name,
        mimeType: mime,
        sizeBytes: size,
        ...extra,
      });
      check(`A: ${purpose} intent allowed`, r.mode === "direct");
    }
    const av = await direct.createUploadIntent(student, {
      purpose: "AVATAR",
      filename: "me.png",
      mimeType: "image/png",
      sizeBytes: 2000,
    });
    check("A: any signed-in user may request an AVATAR intent", av.mode === "direct");

    check(
      "B: unapproved/pending instructor -> denied (service defence in depth)",
      (await throws(() =>
        direct.createUploadIntent(priyanka, thumbInput(elenaCourse.course.id, 100)),
      )) instanceof ForbiddenError,
    );
    check(
      "C: student -> denied for course media",
      (await throws(() =>
        direct.createUploadIntent(student, thumbInput(elenaCourse.course.id, 100)),
      )) instanceof ForbiddenError,
    );
    check(
      "E: instructor A cannot request an intent for instructor B's course",
      (await throws(() =>
        direct.createUploadIntent(marcus, thumbInput(elenaCourse.course.id, 100)),
      )) instanceof mediaService.MediaOwnershipError,
    );
    check(
      "E2: course in a non-editable status (PUBLISHED) -> refused",
      (await throws(() =>
        direct.createUploadIntent(elena, thumbInput(elenaPublished.id, 100)),
      )) instanceof mediaService.MediaStateError,
    );
    check(
      "F: lesson that belongs to another course -> denied",
      (await throws(() =>
        direct.createUploadIntent(elena, {
          purpose: "LESSON_VIDEO",
          courseId: elenaCourse.course.id,
          lessonId: marcusCourse.lesson.id,
          filename: "v.mp4",
          mimeType: "video/mp4",
          sizeBytes: 100,
        }),
      )) instanceof mediaService.MediaOwnershipError,
    );
    check(
      "F2: lesson purpose without lessonId -> denied",
      (await throws(() =>
        direct.createUploadIntent(elena, {
          purpose: "LESSON_VIDEO",
          courseId: elenaCourse.course.id,
          filename: "v.mp4",
          mimeType: "video/mp4",
          sizeBytes: 100,
        }),
      )) instanceof errors.UploadIntentError,
    );

    const before = await prisma.uploadIntent.count();
    for (const [label, input] of [
      [
        "G: unsupported MIME (video/x-msvideo)",
        {
          purpose: "LESSON_VIDEO",
          lessonId: elenaCourse.lesson.id,
          filename: "v.avi",
          mimeType: "video/x-msvideo",
          sizeBytes: 100,
        },
      ],
      [
        "G: html disguised as image",
        { purpose: "COURSE_THUMBNAIL", filename: "x.html", mimeType: "image/png", sizeBytes: 100 },
      ],
      [
        "G: svg image rejected",
        {
          purpose: "COURSE_THUMBNAIL",
          filename: "x.svg",
          mimeType: "image/svg+xml",
          sizeBytes: 100,
        },
      ],
      [
        "G: .exe resource rejected",
        {
          purpose: "LESSON_RESOURCE",
          lessonId: elenaCourse.lesson.id,
          filename: "setup.exe",
          mimeType: "application/pdf",
          sizeBytes: 100,
        },
      ],
      [
        "G: extension/MIME mismatch",
        { purpose: "COURSE_THUMBNAIL", filename: "x.png", mimeType: "image/jpeg", sizeBytes: 100 },
      ],
      [
        "H: thumbnail over 5 MB",
        {
          purpose: "COURSE_THUMBNAIL",
          filename: "x.png",
          mimeType: "image/png",
          sizeBytes: 5 * 1024 * 1024 + 1,
        },
      ],
      [
        "H: preview over 100 MB",
        {
          purpose: "COURSE_PREVIEW",
          filename: "x.mp4",
          mimeType: "video/mp4",
          sizeBytes: 100 * 1024 * 1024 + 1,
        },
      ],
      [
        "H: lesson video over 500 MB",
        {
          purpose: "LESSON_VIDEO",
          lessonId: elenaCourse.lesson.id,
          filename: "x.mp4",
          mimeType: "video/mp4",
          sizeBytes: 500 * 1024 * 1024 + 1,
        },
      ],
      [
        "H: resource over 50 MB",
        {
          purpose: "LESSON_RESOURCE",
          lessonId: elenaCourse.lesson.id,
          filename: "x.pdf",
          mimeType: "application/pdf",
          sizeBytes: 50 * 1024 * 1024 + 1,
        },
      ],
      [
        "H: avatar over 3 MB",
        {
          purpose: "AVATAR",
          filename: "x.png",
          mimeType: "image/png",
          sizeBytes: 3 * 1024 * 1024 + 1,
        },
      ],
    ] as const) {
      const err = await throws(() =>
        direct.createUploadIntent(elena, { courseId: elenaCourse.course.id, ...input }),
      );
      check(`${label} -> refused before any URL`, err instanceof MediaValidationError);
    }
    for (const [label, input] of [
      ["zero size", { sizeBytes: 0 }],
      ["negative size", { sizeBytes: -5 }],
      ["fractional size", { sizeBytes: 10.5 }],
      ["unknown purpose", { purpose: "ADMIN_ANYTHING" }],
      ["missing filename", { filename: "" }],
    ] as const) {
      const err = await throws(() =>
        direct.createUploadIntent(elena, { ...thumbInput(elenaCourse.course.id, 100), ...input }),
      );
      check(`schema: ${label} -> refused`, err instanceof errors.UploadIntentError);
    }
    check(
      "refused requests created no intent rows",
      (await prisma.uploadIntent.count()) === before,
    );

    // --------------------------------------------------- happy path + replace
    section("Happy path: PUT then finalize");
    const goodThumb = fakePng(1000);
    check("PUT of the file to the presigned URL succeeds", (await putTo(t1, goodThumb)) === 200);
    check("object now exists in R2 under the server key", await exists(key1));
    const f1 = await finalize(elena, elena, t1.intentId);
    check("finalize returns an AssetDTO", "assetId" in f1 && f1.url.startsWith("/media/public/"));
    const asset1 = await prisma.asset.findUniqueOrThrow({
      where: { id: "assetId" in f1 ? f1.assetId : "" },
    });
    check(
      "Asset is recorded as S3 with the intent's key/size/type",
      asset1.storageProvider === "S3" &&
        asset1.storageKey === key1 &&
        asset1.sizeBytes === 1000 &&
        asset1.mimeType === "image/png",
    );
    check("Asset is owned by the uploader", asset1.ownerId === elena.id);
    check(
      "course.thumbnailAssetId points at the new asset",
      (await prisma.course.findUniqueOrThrow({ where: { id: elenaCourse.course.id } }))
        .thumbnailAssetId === asset1.id,
    );
    const i1 = await prisma.uploadIntent.findUniqueOrThrow({ where: { id: t1.intentId } });
    check(
      "intent is marked finalized and linked to the asset",
      i1.finalizedAt !== null && i1.assetId === asset1.id,
    );

    // ------------------------------------------------------------- idempotency
    section("Idempotency & races (M, N)");
    const f1b = await finalize(elena, elena, t1.intentId);
    check(
      "M: duplicate finalize returns the SAME asset",
      "assetId" in f1b && f1b.assetId === asset1.id,
    );
    check(
      "M: still exactly one Asset row for the key",
      (await prisma.asset.count({ where: { storageKey: key1 } })) === 1,
    );

    const tRace = await newIntent(elena, {
      purpose: "LESSON_RESOURCE",
      courseId: elenaCourse.course.id,
      lessonId: elenaCourse.lesson.id,
      filename: "race.pdf",
      mimeType: "application/pdf",
      sizeBytes: 3000,
      title: "Race",
    });
    await putTo(tRace, fakePdf(3000));
    const raceKey = await keyOf(tRace.intentId);
    const results = await Promise.all(
      Array.from({ length: 6 }, () => finalize(elena, elena, tRace.intentId)),
    );
    const ids = new Set(results.map((r) => ("id" in r ? r.id : "?")));
    check("N: 6 simultaneous finalizes all succeed", results.length === 6);
    check("N: they all return the same resource", ids.size === 1 && !ids.has("?"));
    check(
      "N: exactly ONE Asset row",
      (await prisma.asset.count({ where: { storageKey: raceKey } })) === 1,
    );
    const raceAsset = await prisma.asset.findUniqueOrThrow({ where: { storageKey: raceKey } });
    check(
      "N: exactly ONE LessonResource row",
      (await prisma.lessonResource.count({ where: { assetId: raceAsset.id } })) === 1,
    );
    check(
      "N: resource position is sane (no duplicate rows)",
      (await prisma.lessonResource.count({
        where: { lessonId: elenaCourse.lesson.id, title: "Race" },
      })) === 1,
    );

    // --------------------------------------------------------- finalize attacks
    section("Finalize security (I, J, K, L)");
    const tOther = await newIntent(marcus, thumbInput(marcusCourse.course.id, 500));
    await putTo(tOther, fakePng(500));
    check(
      "I: another user cannot finalize my intent (404, indistinguishable from missing)",
      (await throws(() => finalize(elena, elena, tOther.intentId))) instanceof
        errors.UploadNotFoundError,
    );
    check(
      "I: unknown intent id -> not found",
      (await throws(() => finalize(elena, elena, "cl_does_not_exist"))) instanceof
        errors.UploadNotFoundError,
    );
    check(
      "I: student cannot finalize an instructor's intent",
      (await throws(() => finalize(student, elena, tOther.intentId))) instanceof
        errors.UploadNotFoundError,
    );
    check(
      "I: the other instructor's object is untouched and still unattached",
      (await exists(await keyOf(tOther.intentId))) &&
        (await prisma.asset.count({ where: { storageKey: await keyOf(tOther.intentId) } })) === 0,
    );

    // Attacker owns an intent but has uploaded NOTHING; another object exists at a different key.
    const tNone = await newIntent(elena, thumbInput(elenaCourse.course.id, 700));
    check(
      "K: finalize before the object exists -> refused",
      (await throws(() => finalize(elena, elena, tNone.intentId))) instanceof
        errors.UploadIntentError,
    );
    check(
      "K: refusing left no asset and the intent still unfinalized",
      (await prisma.uploadIntent.findUniqueOrThrow({ where: { id: tNone.intentId } }))
        .finalizedAt === null,
    );
    check(
      "I: finalizing never touches another intent's finalized object (asset1 intact)",
      await exists(key1),
    );

    const expired = await newIntent(
      elena,
      thumbInput(elenaCourse.course.id, 700),
      new Date(Date.now() - 3 * 3600 * 1000),
    );
    await putTo(expired, fakePng(700));
    check(
      "J: expired intent -> refused even though the object exists",
      (await throws(() => finalize(elena, elena, expired.intentId))) instanceof
        errors.UploadIntentError,
    );
    check(
      "J: no asset created for the expired intent",
      (await prisma.asset.count({ where: { storageKey: await keyOf(expired.intentId) } })) === 0,
    );

    const tSize = await newIntent(elena, thumbInput(elenaCourse.course.id, 1000));
    await putTo(tSize, fakePng(1500)); // declared 1000, uploaded 1500
    const sizeKey = await keyOf(tSize.intentId);
    check(
      "L: size mismatch -> refused",
      (await throws(() => finalize(elena, elena, tSize.intentId))) instanceof
        errors.UploadIntentError,
    );
    check("L: mismatched object is deleted from R2", !(await exists(sizeKey)));
    check(
      "L: no asset created and course still points at the previous thumbnail",
      (await prisma.asset.count({ where: { storageKey: sizeKey } })) === 0 &&
        (await prisma.course.findUniqueOrThrow({ where: { id: elenaCourse.course.id } }))
          .thumbnailAssetId === asset1.id,
    );

    const tType = await newIntent(elena, thumbInput(elenaCourse.course.id, 800));
    await putTo(tType, fakePng(800), { "Content-Type": "image/jpeg" }); // declared png, stored jpeg
    const typeKey = await keyOf(tType.intentId);
    check(
      "L: stored Content-Type differs from the declared one -> refused",
      (await throws(() => finalize(elena, elena, tType.intentId))) instanceof
        errors.UploadIntentError,
    );
    check("L: wrong-type object deleted from R2", !(await exists(typeKey)));

    const tMagic = await newIntent(elena, {
      purpose: "COURSE_PREVIEW",
      courseId: elenaCourse.course.id,
      filename: "fake.mp4",
      mimeType: "video/mp4",
      sizeBytes: 2000,
    });
    await putTo(tMagic, Buffer.alloc(2000, 0x41)); // right size/type header, but not an mp4
    const magicKey = await keyOf(tMagic.intentId);
    check(
      "L: file whose bytes are not an MP4 -> refused (magic-byte peek)",
      (await throws(() => finalize(elena, elena, tMagic.intentId))) instanceof FileSignatureError,
    );
    check(
      "L: fake-mp4 object deleted and no asset created",
      !(await exists(magicKey)) &&
        (await prisma.asset.count({ where: { storageKey: magicKey } })) === 0,
    );

    // course becomes non-editable between intent and finalize
    const tState = await newIntent(marcus, thumbInput(marcusCourse.course.id, 600));
    await putTo(tState, fakePng(600));
    await prisma.course.update({
      where: { id: marcusCourse.course.id },
      data: { status: "PENDING_REVIEW" },
    });
    check(
      "finalize re-checks authorization: course submitted for review meanwhile -> refused",
      (await throws(() => finalize(marcus, marcus, tState.intentId))) instanceof
        mediaService.MediaStateError,
    );
    await prisma.course.update({
      where: { id: marcusCourse.course.id },
      data: { status: "DRAFT" },
    });
    check(
      "...and no asset was created",
      (await prisma.asset.count({ where: { storageKey: await keyOf(tState.intentId) } })) === 0,
    );
    const tPend = await newIntent(elena, thumbInput(elenaCourse.course.id, 650));
    await putTo(tPend, fakePng(650));
    check(
      "finalize re-checks instructor approval (resolveInstructor throwing -> refused)",
      (await throws(() =>
        direct.finalizeUpload({
          user: elena,
          intentId: tPend.intentId,
          resolveInstructor: async () => {
            throw new ForbiddenError();
          },
        }),
      )) instanceof ForbiddenError,
    );

    const cap: Intent[] = [];
    let capErr: unknown = null;
    for (let i = 0; i < direct.MAX_OPEN_INTENTS_PER_USER + 2 && !capErr; i++) {
      capErr = await throws(async () =>
        cap.push(await newIntent(marcus, thumbInput(marcusCourse.course.id, 100))),
      );
    }
    check(
      "open-intent cap stops a user hoarding presigned URLs",
      capErr instanceof errors.UploadIntentError,
    );
    await prisma.uploadIntent.deleteMany({ where: { userId: marcus.id, finalizedAt: null } });

    // ----------------------------------------------------------- replacement
    section("Replacement media (O)");
    const keyOld = key1;
    const tNew = await newIntent(elena, thumbInput(elenaCourse.course.id, 1200));
    // O1: failed replacement (size mismatch) leaves the old thumbnail fully intact
    await putTo(tNew, fakePng(999));
    await throws(() => finalize(elena, elena, tNew.intentId));
    const afterFail = await prisma.course.findUniqueOrThrow({
      where: { id: elenaCourse.course.id },
    });
    check(
      "O: failed replacement keeps the previous asset referenced",
      afterFail.thumbnailAssetId === asset1.id,
    );
    check("O: failed replacement keeps the previous object in R2", await exists(keyOld));
    const stillServes = await serveAssetResponse(asset1.id, new Request("http://x/m"));
    check(
      "O: previous media still plays/serves after the failed replacement",
      stillServes.status === 200,
    );
    await stillServes.arrayBuffer();
    // O2: successful replacement
    const tNew2 = await newIntent(elena, thumbInput(elenaCourse.course.id, 1200));
    await putTo(tNew2, fakePng(1200));
    const f2 = await finalize(elena, elena, tNew2.intentId);
    const after = await prisma.course.findUniqueOrThrow({ where: { id: elenaCourse.course.id } });
    check(
      "O: success switches the course to the new asset",
      "assetId" in f2 && after.thumbnailAssetId === f2.assetId && f2.assetId !== asset1.id,
    );
    check(
      "O: old Asset row removed only after the switch",
      (await prisma.asset.findUnique({ where: { id: asset1.id } })) === null,
    );
    check("O: old object cleaned up from R2", !(await exists(keyOld)));
    check("O: new object present in R2", await exists(await keyOf(tNew2.intentId)));

    // ------------------------------------------------- lesson video + playback
    section("Lesson video: attach, Range playback, resource download (R, S, T)");
    const vidBytes = fakeMp4(300_000);
    const tVid = await newIntent(elena, {
      purpose: "LESSON_VIDEO",
      courseId: elenaCourse.course.id,
      lessonId: elenaCourse.lesson.id,
      filename: "lesson.mp4",
      mimeType: "video/mp4",
      sizeBytes: vidBytes.length,
    });
    await putTo(tVid, vidBytes);
    const fVid = await finalize(elena, elena, tVid.intentId);
    check(
      "lesson video url is the PRIVATE route (/media/lesson-video/…)",
      "url" in fVid && fVid.url.startsWith("/media/lesson-video/"),
    );
    const vidAsset = await prisma.asset.findUniqueOrThrow({
      where: { id: "assetId" in fVid ? fVid.assetId : "" },
    });
    check(
      "lesson.videoAssetId set",
      (await prisma.lesson.findUniqueOrThrow({ where: { id: elenaCourse.lesson.id } }))
        .videoAssetId === vidAsset.id,
    );
    const full = await serveAssetResponse(vidAsset.id, new Request("http://x/m"));
    check(
      "S: full GET of a direct-uploaded video -> 200 with exact bytes",
      full.status === 200 && Buffer.from(await full.arrayBuffer()).equals(vidBytes),
    );
    check("S: Content-Type is video/mp4", full.headers.get("content-type") === "video/mp4");
    const rng = await serveAssetResponse(
      vidAsset.id,
      new Request("http://x/m", { headers: { Range: "bytes=1000-1999" } }),
    );
    check(
      "S: Range request -> 206 with correct Content-Range",
      rng.status === 206 &&
        rng.headers.get("content-range") === `bytes 1000-1999/${vidBytes.length}`,
    );
    check(
      "S: Range body is the exact slice",
      Buffer.from(await rng.arrayBuffer()).equals(vidBytes.subarray(1000, 2000)),
    );
    const seek = await serveAssetResponse(
      vidAsset.id,
      new Request("http://x/m", { headers: { Range: `bytes=${vidBytes.length - 500}-` } }),
    );
    check(
      "S: seek to the tail (open-ended Range) -> 206",
      seek.status === 206 &&
        Buffer.from(await seek.arrayBuffer()).equals(vidBytes.subarray(vidBytes.length - 500)),
    );
    check(
      "S: nosniff header present on streamed media",
      full.headers.get("x-content-type-options") === "nosniff",
    );
    const resRow = results[0];
    const resBytes = fakePdf(3000);
    const dl = await serveAssetResponse(raceAsset.id, new Request("http://x/m"));
    check(
      "T: direct-uploaded resource streams with exact bytes",
      dl.status === 200 && Buffer.from(await dl.arrayBuffer()).equals(resBytes),
    );
    check(
      "T: resource is served as an attachment",
      (dl.headers.get("content-disposition") ?? "").toLowerCase().includes("attachment") ||
        dl.headers.get("content-type") === "application/pdf",
    );
    void resRow;

    // ---------------------------------------------------------------- deletion
    section("Delete flow (P, Q)");
    check(
      "Q: another instructor cannot remove my lesson video",
      (await throws(() =>
        mediaService.removeLessonVideo(marcus, elenaCourse.course.id, elenaCourse.lesson.id),
      )) instanceof mediaService.MediaOwnershipError,
    );
    check(
      "Q: another instructor cannot remove my course thumbnail",
      (await throws(() =>
        mediaService.removeCourseThumbnail(marcus, elenaCourse.course.id),
      )) instanceof mediaService.MediaOwnershipError,
    );
    check(
      "Q: nothing was deleted by the refused attempts",
      (await exists(vidAsset.storageKey)) &&
        (await prisma.asset.count({ where: { id: vidAsset.id } })) === 1,
    );
    await mediaService.removeLessonVideo(elena, elenaCourse.course.id, elenaCourse.lesson.id);
    check(
      "P: remove video -> DB relation cleared",
      (await prisma.lesson.findUniqueOrThrow({ where: { id: elenaCourse.lesson.id } }))
        .videoAssetId === null,
    );
    check(
      "P: remove video -> Asset row gone",
      (await prisma.asset.findUnique({ where: { id: vidAsset.id } })) === null,
    );
    check("P: remove video -> R2 object deleted", !(await exists(vidAsset.storageKey)));
    const resource = await prisma.lessonResource.findFirstOrThrow({
      where: { assetId: raceAsset.id },
    });
    await mediaService.removeLessonResource(
      elena,
      elenaCourse.course.id,
      elenaCourse.lesson.id,
      resource.id,
    );
    check(
      "P: remove resource -> row, asset and R2 object all gone",
      (await prisma.lessonResource.count({ where: { id: resource.id } })) === 0 &&
        !(await exists(raceAsset.storageKey)),
    );
    await mediaService.removeCourseThumbnail(elena, elenaCourse.course.id);
    check(
      "P: remove thumbnail -> object deleted and relation cleared",
      !(await exists(await keyOf(tNew2.intentId))) &&
        (await prisma.course.findUniqueOrThrow({ where: { id: elenaCourse.course.id } }))
          .thumbnailAssetId === null,
    );
    check(
      "P: removing twice is harmless (idempotent)",
      (await throws(() => mediaService.removeCourseThumbnail(elena, elenaCourse.course.id))) ===
        null,
    );

    // -------------------------------------------------- avatar through the same flow
    section("Avatar through the same flow");
    const avIntent = await newIntent(student, {
      purpose: "AVATAR",
      filename: "me.png",
      mimeType: "image/png",
      sizeBytes: 900,
    });
    await putTo(avIntent, fakePng(900));
    const fAv = await direct.finalizeUpload({
      user: student,
      intentId: avIntent.intentId,
      resolveInstructor: async () => {
        throw new Error("must not be called for AVATAR");
      },
    });
    const stu = await prisma.user.findUniqueOrThrow({ where: { id: student.id } });
    check(
      "avatar: finalize works for a student without instructor approval",
      "assetId" in fAv && stu.avatarAssetId === fAv.assetId,
    );
    const avAsset = await prisma.asset.findUniqueOrThrow({
      where: { id: stu.avatarAssetId as string },
    });
    check(
      "avatar: key lives under avatars/<userId>/ and provider is S3",
      avAsset.storageKey.startsWith(`avatars/${student.id}/`) && avAsset.storageProvider === "S3",
    );
    const avIntent2 = await newIntent(student, {
      purpose: "AVATAR",
      filename: "me2.png",
      mimeType: "image/png",
      sizeBytes: 950,
    });
    await putTo(avIntent2, fakePng(950));
    await direct.finalizeUpload({
      user: student,
      intentId: avIntent2.intentId,
      resolveInstructor: async () => {
        throw new Error("no");
      },
    });
    check(
      "avatar: replacing deletes the previous avatar object only after the switch",
      !(await exists(avAsset.storageKey)),
    );
    await mediaService.removeUserAvatar(student);

    // ------------------------------------------------------------ cleanup
    section("Orphan cleanup");
    const orphanOld = await newIntent(
      elena,
      thumbInput(elenaCourse.course.id, 400),
      new Date(Date.now() - 5 * 3600 * 1000),
    );
    await putTo(orphanOld, fakePng(400));
    const orphanKey = await keyOf(orphanOld.intentId);
    const orphanNoObject = await newIntent(
      elena,
      thumbInput(elenaCourse.course.id, 400),
      new Date(Date.now() - 5 * 3600 * 1000),
    );
    const orphanFresh = await newIntent(elena, thumbInput(elenaCourse.course.id, 400)); // still inside its window
    await putTo(orphanFresh, fakePng(400));
    const freshKey = await keyOf(orphanFresh.intentId);
    const keepAsset = await newIntent(
      elena,
      thumbInput(elenaCourse.course.id, 410),
      new Date(Date.now() - 5 * 3600 * 1000),
    );
    await putTo(keepAsset, fakePng(410));
    const keepKey = await keyOf(keepAsset.intentId);
    const referenced = await prisma.asset.create({
      data: {
        ownerId: elena.id,
        storageProvider: "S3",
        storageKey: keepKey,
        originalFilename: "k.png",
        mimeType: "image/png",
        sizeBytes: 410,
        purpose: "COURSE_THUMBNAIL",
      },
    });

    const dry = await direct.cleanupAbandonedUploads({});
    check(
      "cleanup default is a DRY RUN that deletes nothing",
      dry.dryRun === true &&
        (await exists(orphanKey)) &&
        (await prisma.uploadIntent.count({ where: { id: orphanOld.intentId } })) === 1,
    );
    check("dry run reports candidates", dry.scanned >= 3);
    const done = await direct.cleanupAbandonedUploads({ execute: true });
    check("execute: abandoned, expired object is deleted from R2", !(await exists(orphanKey)));
    check(
      "execute: its intent row is removed",
      (await prisma.uploadIntent.count({ where: { id: orphanOld.intentId } })) === 0,
    );
    check(
      "execute: expired intent whose object never arrived is removed harmlessly",
      (await prisma.uploadIntent.count({ where: { id: orphanNoObject.intentId } })) === 0,
    );
    check(
      "execute: an intent still inside its window is NOT touched",
      (await exists(freshKey)) &&
        (await prisma.uploadIntent.count({ where: { id: orphanFresh.intentId } })) === 1,
    );
    check(
      "execute: an object referenced by an Asset is NEVER deleted",
      (await exists(keepKey)) && done.skippedHasAsset >= 1,
    );
    check(
      "execute: finalized intents/assets are untouched",
      (await prisma.asset.count({ where: { id: referenced.id } })) === 1 &&
        (await prisma.uploadIntent.count({ where: { finalizedAt: { not: null } } })) >= 1,
    );
    check("cleanup reports no errors", done.errors === 0);
    await prisma.asset.delete({ where: { id: referenced.id } });

    // ----------------------------------------------- large file via the provider
    section("Large file straight to the (fake) store");
    const big = fakeMp4(60 * 1024 * 1024);
    const tBig = await newIntent(elena, {
      purpose: "LESSON_VIDEO",
      courseId: elenaCourse.course.id,
      lessonId: elenaCourse.lesson.id,
      filename: "big.mp4",
      mimeType: "video/mp4",
      sizeBytes: big.length,
    });
    check(
      "60 MB declared size is accepted at intent time (limit is 500 MB)",
      tBig.mode === "direct",
    );
    check("60 MB PUT goes to the store URL", (await putTo(tBig, big)) === 200);
    const fBig = await finalize(elena, elena, tBig.intentId);
    const bigAsset = await prisma.asset.findUniqueOrThrow({
      where: { id: "assetId" in fBig ? fBig.assetId : "" },
    });
    check("60 MB lesson video finalized with the exact size", bigAsset.sizeBytes === big.length);
    const bigRange = await serveAssetResponse(
      bigAsset.id,
      new Request("http://x/m", { headers: { Range: "bytes=52428800-52429823" } }),
    );
    check(
      "Range seek deep into the 60 MB file -> 206 exact slice",
      bigRange.status === 206 &&
        Buffer.from(await bigRange.arrayBuffer()).equals(big.subarray(52428800, 52429824)),
    );
    await mediaService.removeLessonVideo(elena, elenaCourse.course.id, elenaCourse.lesson.id);

    // ----------------------------------------------- legacy routes in S3 mode
    section("Legacy multipart routes in R2 mode");
    check("direct upload reported enabled", direct.isDirectUploadEnabled() === true);
    check(
      "assertServerMediatedUploadAllowed() refuses in R2 mode (large bodies never proxied)",
      (await throws(() => direct.assertServerMediatedUploadAllowed())) instanceof
        errors.UploadIntentError,
    );
    void randomBytes;
  } finally {
    await server.close();
  }
  const { prisma: p } = await import("../src/server/db/client");
  await p.$disconnect();
}

main()
  .catch((e) => {
    failed++;
    failures.push("UNCAUGHT: " + (e instanceof Error ? e.stack : String(e)));
    console.error(e);
  })
  .finally(() => {
    console.log(
      `\n${LOCAL_MODE ? "[local mode] " : "[s3 mode] "}RESULT: ${passed} passed, ${failed} failed`,
    );
    if (failures.length) console.log("Failures:\n - " + failures.join("\n - "));
    process.exit(failed ? 1 : 0);
  });
