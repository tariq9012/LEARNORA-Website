/**
 * Phase 19 verification (production-readiness changes). Local only, FAKE S3
 * (`s3rver`), disposable database. Refuses any database not ending in "_test".
 *
 *   DATABASE_URL=postgresql://.../learnora_p19_test SESSION_SECRET=... npx tsx scripts/verify-phase19.ts
 *
 * Covers: cron auth fails closed, SSE on/off decision, new env vars, the
 * background helper, and the LOCAL -> S3 migration utility (dry run, execute,
 * idempotency, conflict, missing file, S3 rows untouched, nothing deleted).
 * The cron route and /api/events over HTTP are covered by verify-phase19-http.ts.
 * This is NOT a real R2/Neon/Vercel test.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error s3rver ships no type declarations
import S3rver from "s3rver";

const execFileAsync = promisify(execFile);
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

async function main() {
  const scratch = mkdtempSync(join(tmpdir(), "p19-"));
  const localRoot = join(scratch, "uploads");
  mkdirSync(localRoot, { recursive: true });
  const S3_PORT = 4581;
  const s3env = {
    STORAGE_PROVIDER: "s3",
    S3_ENDPOINT: `http://127.0.0.1:${S3_PORT}`,
    S3_REGION: "us-east-1",
    S3_BUCKET: "learnora-p19-bucket",
    S3_ACCESS_KEY_ID: "S3RVER",
    S3_SECRET_ACCESS_KEY: "S3RVER-test-secret",
    LOCAL_STORAGE_ROOT: localRoot,
  };

  // ---------------------------------------------------------------- pure logic
  section("cron auth fails closed");
  const { checkCronAuth } = await import("../src/server/lib/cron-auth");
  const secret = "s".repeat(40);
  check(
    "no secret configured -> not_configured",
    checkCronAuth(`Bearer ${secret}`, undefined) === "not_configured",
  );
  check("empty secret -> not_configured", checkCronAuth("Bearer ", "") === "not_configured");
  check("missing header -> unauthorized", checkCronAuth(null, secret) === "unauthorized");
  check(
    "wrong secret -> unauthorized",
    checkCronAuth(`Bearer ${"x".repeat(40)}`, secret) === "unauthorized",
  );
  check("shorter token -> unauthorized", checkCronAuth("Bearer abc", secret) === "unauthorized");
  check("no Bearer prefix -> unauthorized", checkCronAuth(secret, secret) === "unauthorized");
  check("correct secret -> ok", checkCronAuth(`Bearer ${secret}`, secret) === "ok");

  section("SSE decision + env parsing");
  const { isRealtimeStreamEnabled } = await import("../src/server/services/realtime-service");
  check("auto + local -> on", isRealtimeStreamEnabled({ REALTIME_SSE: "auto" }) === true);
  check(
    "auto + Vercel -> off",
    isRealtimeStreamEnabled({ REALTIME_SSE: "auto", VERCEL: "1" }) === false,
  );
  check("on + Vercel -> on", isRealtimeStreamEnabled({ REALTIME_SSE: "on", VERCEL: "1" }) === true);
  check("off + local -> off", isRealtimeStreamEnabled({ REALTIME_SSE: "off" }) === false);

  const { parseServerEnv } = await import("../src/server/env");
  const base = {
    DATABASE_URL: process.env["DATABASE_URL"],
    SESSION_SECRET: process.env["SESSION_SECRET"],
  };
  const e1 = parseServerEnv({ ...base });
  check("REALTIME_SSE defaults to auto", e1.REALTIME_SSE === "auto");
  check("CRON_SECRET optional", e1.CRON_SECRET === undefined);
  check(
    "blank CRON_SECRET treated as unset",
    parseServerEnv({ ...base, CRON_SECRET: "" }).CRON_SECRET === undefined,
  );
  let shortRejected = false;
  try {
    parseServerEnv({ ...base, CRON_SECRET: "too-short" });
  } catch {
    shortRejected = true;
  }
  check("CRON_SECRET shorter than 32 chars rejected", shortRejected);
  let badSse = false;
  try {
    parseServerEnv({ ...base, REALTIME_SSE: "maybe" });
  } catch {
    badSse = true;
  }
  check("invalid REALTIME_SSE rejected", badSse);

  section("runInBackground");
  const { runInBackground } = await import("../src/server/lib/background");
  let done = false;
  runInBackground(new Promise((r) => setTimeout(r, 20)).then(() => (done = true)));
  check("returns immediately (does not block)", done === false);
  await new Promise((r) => setTimeout(r, 60));
  check("work still completes without a Vercel context", done === true);
  let threw = false;
  try {
    runInBackground(Promise.reject(new Error("boom")));
    await new Promise((r) => setTimeout(r, 20));
  } catch {
    threw = true;
  }
  check("a rejecting promise never escapes", threw === false);

  // ------------------------------------------------- LOCAL -> S3 migration tool
  section("migrate-local-assets-to-r2 (fake S3)");
  const server = new S3rver({
    port: S3_PORT,
    address: "127.0.0.1",
    silent: true,
    directory: join(scratch, "s3"),
    configureBuckets: [{ name: s3env.S3_BUCKET, configs: [] }],
  });
  await server.run();
  try {
    Object.assign(process.env, s3env);
    const { prisma } = await import("../src/server/db/client");
    const { getStorageProviderFor } = await import("../src/server/storage");
    const bucket = getStorageProviderFor("S3");

    const owner = await prisma.user.findFirstOrThrow({
      where: { role: "INSTRUCTOR" },
      select: { id: true },
    });
    await prisma.asset.deleteMany({ where: { storageKey: { startsWith: "p19/" } } });

    const mk = async (
      key: string,
      provider: "LOCAL" | "S3",
      size: number,
      purpose = "COURSE_THUMBNAIL",
    ) =>
      prisma.asset.create({
        data: {
          ownerId: owner.id,
          purpose: purpose as never,
          storageProvider: provider,
          storageKey: key,
          originalFilename: key.split("/").pop() ?? key,
          mimeType: "image/png",
          sizeBytes: size,
        } as never,
        select: { id: true },
      });

    const files: Record<string, Buffer> = {
      "p19/ok.png": Buffer.alloc(2048, 7),
      "p19/prestaged.png": Buffer.alloc(1024, 8),
      "p19/conflict.png": Buffer.alloc(512, 9),
    };
    for (const [k, v] of Object.entries(files)) {
      mkdirSync(join(localRoot, "p19"), { recursive: true });
      writeFileSync(join(localRoot, k), v);
    }
    const aOk = await mk("p19/ok.png", "LOCAL", 2048);
    const aPre = await mk("p19/prestaged.png", "LOCAL", 1024);
    const aConf = await mk("p19/conflict.png", "LOCAL", 512);
    const aMiss = await mk("p19/missing.png", "LOCAL", 100);
    const aS3 = await mk("p19/already-s3.png", "S3", 64);
    // pre-stage objects in the bucket
    await bucket.save(
      "p19/prestaged.png",
      (await import("node:stream")).Readable.from(files["p19/prestaged.png"]!),
    );
    await bucket.save(
      "p19/conflict.png",
      (await import("node:stream")).Readable.from(Buffer.alloc(999, 1)),
    );
    await bucket.save(
      "p19/already-s3.png",
      (await import("node:stream")).Readable.from(Buffer.alloc(64, 2)),
    );

    const run = async (args: string[], extraEnv: Record<string, string> = {}) => {
      try {
        const { stdout } = await execFileAsync(
          "npx",
          ["tsx", "scripts/migrate-local-assets-to-r2.ts", ...args],
          {
            env: { ...process.env, ...extraEnv },
            timeout: 120_000,
          },
        );
        return { code: 0, out: stdout };
      } catch (e) {
        const err = e as { code?: number; stdout?: string };
        return { code: typeof err.code === "number" ? err.code : 1, out: err.stdout ?? "" };
      }
    };
    const provider = async (id: string) =>
      (await prisma.asset.findUniqueOrThrow({ where: { id }, select: { storageProvider: true } }))
        .storageProvider;
    const inBucket = (k: string) =>
      bucket
        .stat(k)
        .then((s) => s.sizeBytes)
        .catch(() => null);
    const rowCount = () => prisma.asset.count({ where: { storageKey: { startsWith: "p19/" } } });

    const dry = await run([]);
    check(
      "dry run reports DRY RUN and exits 1 only on conflicts (conflict present)",
      /DRY RUN/.test(dry.out) && dry.code === 1,
    );
    check("dry run: nothing copied", (await inBucket("p19/ok.png")) === null);
    check(
      "dry run: no row changed",
      (await provider(aOk.id)) === "LOCAL" && (await provider(aPre.id)) === "LOCAL",
    );
    check("dry run reports missing local file", /local file missing:\s+1/.test(dry.out));
    check("dry run reports conflict", /conflicts:\s+1/.test(dry.out));
    check("dry run output never prints storage keys", !dry.out.includes("p19/"));

    const ex = await run(["--execute"]);
    check("execute copies the object", (await inBucket("p19/ok.png")) === 2048);
    check("execute flips copied row to S3", (await provider(aOk.id)) === "S3");
    check(
      "pre-staged equal-size object: row flipped, no re-upload needed",
      (await provider(aPre.id)) === "S3",
    );
    check("conflict: row stays LOCAL", (await provider(aConf.id)) === "LOCAL");
    check("conflict: bucket object NOT overwritten", (await inBucket("p19/conflict.png")) === 999);
    check("missing local file: row stays LOCAL", (await provider(aMiss.id)) === "LOCAL");
    check("missing file never created in bucket", (await inBucket("p19/missing.png")) === null);
    check(
      "existing S3 row untouched",
      (await provider(aS3.id)) === "S3" && (await inBucket("p19/already-s3.png")) === 64,
    );
    check("no database rows deleted", (await rowCount()) === 5);
    check(
      "local files never deleted",
      Object.keys(files).every((k) => existsSync(join(localRoot, k))),
    );
    check("execute exits non-zero while a conflict remains", ex.code === 1);

    const again = await run(["--execute"]);
    check("second run is idempotent (ok.png not re-processed)", !/copied:\s+[1-9]/.test(again.out));
    check(
      "second run changes nothing further",
      (await provider(aOk.id)) === "S3" && (await rowCount()) === 5,
    );

    const refuse = (await run([], { STORAGE_PROVIDER: "local" })).code;
    check("refuses to run when STORAGE_PROVIDER is not s3", refuse === 1);

    await prisma.asset.deleteMany({ where: { storageKey: { startsWith: "p19/" } } });
    await prisma.$disconnect();
  } finally {
    await server.close();
  }

  console.log(`\nPhase 19 verification: ${passed} passed, ${failed} failed.`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
