/**
 * Phase 19 HTTP verification: starts the BUILT app (.output/server/index.mjs,
 * default node preset) and drives the cron endpoint and /api/events over real
 * HTTP, with a FAKE S3 (`s3rver`). Refuses any database not ending in "_test".
 * Run `npm run build:app` first. NOT a real Vercel/R2 test.
 *
 *   DATABASE_URL=postgresql://.../learnora_p19http_test SESSION_SECRET=... npx tsx scripts/verify-phase19-http.ts
 */
import { spawn, type ChildProcess } from "node:child_process";
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

const S3_PORT = 4591;
const CRON_SECRET = "c".repeat(48);

function startApp(port: number, extra: Record<string, string>): ChildProcess {
  return spawn("node", [".output/server/index.mjs"], {
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      NODE_ENV: "test",
      APP_URL: `http://127.0.0.1:${port}`,
      STORAGE_PROVIDER: "s3",
      S3_ENDPOINT: `http://127.0.0.1:${S3_PORT}`,
      S3_REGION: "us-east-1",
      S3_BUCKET: "learnora-p19http-bucket",
      S3_ACCESS_KEY_ID: "S3RVER",
      S3_SECRET_ACCESS_KEY: "S3RVER-test-secret",
      ...extra,
    },
    stdio: "ignore",
  });
}

async function waitReady(port: number) {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/ready`);
      if (r.status < 500) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`app on ${port} did not start`);
}

async function main() {
  const scratch = mkdtempSync(join(tmpdir(), "p19http-"));
  const s3 = new S3rver({
    port: S3_PORT,
    address: "127.0.0.1",
    silent: true,
    directory: join(scratch, "s3"),
    configureBuckets: [{ name: "learnora-p19http-bucket", configs: [] }],
  });
  await s3.run();
  const apps: ChildProcess[] = [];
  try {
    // ------------------------------------------------ cron: NO secret configured
    section("cron endpoint, CRON_SECRET not configured");
    const p1 = 3191;
    apps.push(startApp(p1, {}));
    await waitReady(p1);
    const u1 = `http://127.0.0.1:${p1}/api/cron/cleanup-uploads`;
    const r0 = await fetch(u1);
    check("no secret configured -> 503 (fails closed)", r0.status === 503);
    const r0b = await fetch(u1, { headers: { Authorization: `Bearer ${CRON_SECRET}` } });
    check("a bearer token is still refused when no secret is configured", r0b.status === 503);

    // ---------------------------------------------------- cron: secret configured
    section("cron endpoint, CRON_SECRET configured");
    const p2 = 3192;
    apps.push(startApp(p2, { CRON_SECRET }));
    await waitReady(p2);
    const u2 = `http://127.0.0.1:${p2}/api/cron/cleanup-uploads`;
    check("no Authorization header -> 401", (await fetch(u2)).status === 401);
    check(
      "wrong token -> 401",
      (await fetch(u2, { headers: { Authorization: `Bearer ${"x".repeat(48)}` } })).status === 401,
    );
    check(
      "session cookie alone is not accepted",
      (await fetch(u2, { headers: { Cookie: "learnora_session=abc" } })).status === 401,
    );
    const post = await fetch(u2, {
      method: "POST",
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    });
    const postText = await post.text();
    check(
      "POST does not run cleanup (no counts returned)",
      !postText.includes("objectsDeleted"),
      `status=${post.status}`,
    );

    // seed one abandoned intent + its orphan object
    Object.assign(process.env, {
      STORAGE_PROVIDER: "s3",
      S3_ENDPOINT: `http://127.0.0.1:${S3_PORT}`,
      S3_REGION: "us-east-1",
      S3_BUCKET: "learnora-p19http-bucket",
      S3_ACCESS_KEY_ID: "S3RVER",
      S3_SECRET_ACCESS_KEY: "S3RVER-test-secret",
    });
    const { prisma } = await import("../src/server/db/client");
    const { getStorageProviderFor } = await import("../src/server/storage");
    const bucket = getStorageProviderFor("S3");
    const user = await prisma.user.findFirstOrThrow({
      where: { role: "INSTRUCTOR" },
      select: { id: true },
    });
    await prisma.uploadIntent.deleteMany({ where: { storageKey: { startsWith: "p19http/" } } });
    const old = new Date(Date.now() - 5 * 60 * 60 * 1000);
    const abandoned = await prisma.uploadIntent.create({
      data: {
        userId: user.id,
        purpose: "COURSE_THUMBNAIL",
        storageKey: "p19http/abandoned.png",
        originalFilename: "a.png",
        mimeType: "image/png",
        expectedSize: 10,
        expiresAt: old,
        createdAt: old,
      },
    });
    const fresh = await prisma.uploadIntent.create({
      data: {
        userId: user.id,
        purpose: "COURSE_THUMBNAIL",
        storageKey: "p19http/fresh.png",
        originalFilename: "f.png",
        mimeType: "image/png",
        expectedSize: 10,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });
    const { Readable } = await import("node:stream");
    await bucket.save("p19http/abandoned.png", Readable.from(Buffer.alloc(10, 1)));
    await bucket.save("p19http/fresh.png", Readable.from(Buffer.alloc(10, 2)));

    const ok = await fetch(u2, { headers: { Authorization: `Bearer ${CRON_SECRET}` } });
    const body = (await ok.json()) as Record<string, number | boolean>;
    check("correct token -> 200", ok.status === 200, JSON.stringify(body));
    check(
      "response carries counts only",
      ["scanned", "objectsDeleted", "intentsRemoved", "errors"].every((k) => k in body),
    );
    check(
      "abandoned object deleted from bucket",
      await bucket.stat("p19http/abandoned.png").then(
        () => false,
        () => true,
      ),
    );
    check(
      "abandoned intent row removed",
      (await prisma.uploadIntent.findUnique({ where: { id: abandoned.id } })) === null,
    );
    check(
      "unexpired intent untouched",
      (await prisma.uploadIntent.findUnique({ where: { id: fresh.id } })) !== null,
    );
    check(
      "unexpired object untouched",
      await bucket.stat("p19http/fresh.png").then(
        () => true,
        () => false,
      ),
    );
    const again = (await (
      await fetch(u2, { headers: { Authorization: `Bearer ${CRON_SECRET}` } })
    ).json()) as Record<string, number>;
    check(
      "second call is idempotent (nothing more deleted)",
      again["objectsDeleted"] === 0 && again["intentsRemoved"] === 0,
    );
    await prisma.uploadIntent.deleteMany({ where: { storageKey: { startsWith: "p19http/" } } });
    await prisma.$disconnect();

    // ----------------------------------------------------------------- SSE switch
    section("/api/events stream switch");
    const evOn = await fetch(`http://127.0.0.1:${p2}/api/events`);
    check("default (local): unauthenticated -> 401", evOn.status === 401);
    const p3 = 3193;
    apps.push(startApp(p3, { VERCEL: "1" }));
    await waitReady(p3);
    const evOff = await fetch(`http://127.0.0.1:${p3}/api/events`);
    check("on Vercel (auto): 204 so EventSource stops", evOff.status === 204);
    const p4 = 3194;
    apps.push(startApp(p4, { VERCEL: "1", REALTIME_SSE: "on" }));
    await waitReady(p4);
    check(
      "REALTIME_SSE=on overrides on Vercel",
      (await fetch(`http://127.0.0.1:${p4}/api/events`)).status === 401,
    );
  } finally {
    for (const a of apps) a.kill("SIGTERM");
    await s3.close();
  }
  console.log(`\nPhase 19 HTTP verification: ${passed} passed, ${failed} failed.`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
