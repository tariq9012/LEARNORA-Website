/**
 * Phase 18 client verification — EXECUTES the real browser upload client
 * (src/lib/direct-upload.ts) in Node against a RUNNING production build.
 * Refuses any database whose name does not end in "_test".
 *
 * What this proves: the orchestration (intent → PUT → finalize), the phase and
 * progress callbacks, "never finalize after a failed PUT", cancel, retry with a
 * fresh intent, client-side pre-validation, and finalize retry on 5xx.
 *
 * What it does NOT prove: real-browser XMLHttpRequest behaviour, real CORS, or
 * a real Cloudflare R2. `XMLHttpRequest` here is a small shim over fetch, and S3
 * is `s3rver` (a FAKE S3). Real browser + real R2 = NOT TESTED.
 *
 * Start the built app and set the same env as scripts/verify-phase18-http.ts, then:
 *   BASE_URL=http://127.0.0.1:3100 npx tsx scripts/verify-phase18-client.ts
 */
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

// ---------------------------------------------------------------------------
// Browser shims (installed BEFORE the client module is imported)
// ---------------------------------------------------------------------------
const realFetch = globalThis.fetch;
const state = {
  cookie: "",
  csrf: "",
  appCalls: [] as string[],
  putCalls: 0,
  forcePutStatus: 0,
  putDelayMs: 0,
  finalize503: 0,
  forcePutNetworkError: false,
};

Object.assign(globalThis, {
  document: {
    get cookie() {
      return `learnora_csrf=${state.csrf}`;
    },
  },
});

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  if (!url.startsWith("/")) return realFetch(input, init); // direct-to-storage traffic
  state.appCalls.push(url);
  if (url.endsWith("/upload-finalize") && state.finalize503 > 0) {
    state.finalize503--;
    return new Response(JSON.stringify({ error: "boom" }), { status: 503 });
  }
  const headers = {
    ...(init?.headers as Record<string, string> | undefined),
    cookie: state.cookie,
  };
  return realFetch(`${BASE}${url}`, { ...init, headers });
}) as typeof fetch;

class ShimXHR {
  status = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  upload: {
    onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null;
  } = {
    onprogress: null,
  };
  private method = "";
  private url = "";
  private headers: Record<string, string> = {};
  private controller = new AbortController();
  private aborted = false;
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  abort() {
    this.aborted = true;
    this.controller.abort();
    this.onabort?.();
  }
  send(body: Blob) {
    state.putCalls++;
    void (async () => {
      if (state.putDelayMs) await new Promise((r) => setTimeout(r, state.putDelayMs));
      if (this.aborted) return;
      if (state.forcePutNetworkError) {
        this.onerror?.();
        return;
      }
      if (state.forcePutStatus) {
        this.status = state.forcePutStatus;
        this.onload?.();
        return;
      }
      try {
        this.upload.onprogress?.({
          lengthComputable: true,
          loaded: body.size / 2,
          total: body.size,
        });
        const res = await realFetch(this.url, {
          method: this.method,
          headers: this.headers,
          body,
          signal: this.controller.signal,
        });
        this.upload.onprogress?.({ lengthComputable: true, loaded: body.size, total: body.size });
        this.status = res.status;
        this.onload?.();
      } catch {
        if (!this.aborted) this.onerror?.();
      }
    })();
  }
}
Object.assign(globalThis, { XMLHttpRequest: ShimXHR });

function png(size: number): Uint8Array<ArrayBuffer> {
  const b = new Uint8Array(size).fill(0x62);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  return b;
}
function mp4(size: number): Uint8Array<ArrayBuffer> {
  const b = new Uint8Array(size).fill(0x61);
  b.set([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d], 0);
  return b;
}

async function main() {
  const { uploadMedia, UploadFailedError } = await import("../src/lib/direct-upload");
  const { prisma } = await import("../src/server/db/client");
  const { generateOpaqueToken, hashOpaqueToken } = await import("../src/server/auth/tokens");
  const { deriveCsrfToken } = await import("../src/server/auth/csrf");

  async function loginAs(email: string) {
    const u = await prisma.user.findUniqueOrThrow({ where: { email } });
    const raw = generateOpaqueToken();
    await prisma.session.create({
      data: {
        userId: u.id,
        tokenHash: hashOpaqueToken(raw),
        expiresAt: new Date(Date.now() + 3600e3),
      },
    });
    state.cookie = `learnora_session=${raw}`;
    state.csrf = deriveCsrfToken(raw);
    return u;
  }
  const elena = await loginAs("elena.vasquez@learnora.dev");
  const course = await prisma.course.findFirstOrThrow({
    where: { instructorId: elena.id, status: "REJECTED" },
  });
  let section0 = await prisma.courseSection.findFirst({ where: { courseId: course.id } });
  section0 ??= await prisma.courseSection.create({
    data: { courseId: course.id, title: "s", position: 99 },
  });
  let lesson = await prisma.lesson.findFirst({ where: { sectionId: section0.id } });
  lesson ??= await prisma.lesson.create({
    data: { sectionId: section0.id, title: "l", type: "VIDEO", position: 99 },
  });

  const server = new S3rver({
    port: S3_PORT,
    address: "127.0.0.1",
    silent: true,
    directory: mkdtempSync(join(tmpdir(), "learnora-p18client-")),
    configureBuckets: [
      { name: process.env["S3_BUCKET"] ?? "learnora-p18http-bucket", configs: [] },
    ],
  });
  await server.run();
  try {
    const reset = () => {
      state.appCalls = [];
      state.putCalls = 0;
      state.forcePutStatus = 0;
      state.putDelayMs = 0;
      state.finalize503 = 0;
      state.forcePutNetworkError = false;
    };
    const base = {
      purpose: "COURSE_THUMBNAIL" as const,
      courseId: course.id,
      legacy: { url: `/api/instructor/media/thumbnail/${course.id}` },
    };
    const assets = () => prisma.asset.count();
    const intents = () => prisma.uploadIntent.count({ where: { userId: elena.id } });

    section("Happy path (real client code, real server, fake S3)");
    reset();
    const phases: string[] = [];
    const progress: number[] = [];
    const a0 = await assets();
    const result = await uploadMedia<{ assetId: string; url: string }>({
      ...base,
      file: new File([png(2048)], "thumb.png", { type: "image/png" }),
      onPhase: (p) => phases.push(p),
      onProgress: (f) => progress.push(f),
    });
    check(
      "phases are exactly preparing → uploading → finalizing",
      phases.join(",") === "preparing,uploading,finalizing",
      phases.join(","),
    );
    check("progress is reported and reaches 100%", progress.length > 0 && progress.at(-1) === 1);
    check(
      "progress is monotonic",
      progress.every((v, i) => i === 0 || v >= (progress[i - 1] as number)),
    );
    check(
      "returns the finalized asset (only after finalize succeeded)",
      typeof result.assetId === "string" && result.url.startsWith("/media/public/"),
    );
    check("exactly one PUT went to storage", state.putCalls === 1);
    check(
      "app calls were ONLY intent + finalize (the file never went to the app)",
      state.appCalls.join(",") === "/api/media/upload-intent,/api/media/upload-finalize",
      state.appCalls.join(","),
    );
    check("one new Asset row", (await assets()) === a0 + 1);

    section("Client-side pre-validation (UX only)");
    reset();
    const e1 = await uploadMedia({
      ...base,
      file: new File([new Uint8Array(10)], "x.html", { type: "text/html" }),
    }).catch((e) => e);
    check(
      "wrong type is rejected before any network call",
      e1 instanceof UploadFailedError && state.appCalls.length === 0 && state.putCalls === 0,
    );
    const e2 = await uploadMedia({
      ...base,
      file: new File([new Uint8Array(6 * 1024 * 1024)], "big.png", { type: "image/png" }),
    }).catch((e) => e);
    check(
      "oversized file is rejected before any network call",
      e2 instanceof UploadFailedError && state.appCalls.length === 0,
    );

    section("A failed PUT never reaches finalize and creates nothing");
    reset();
    state.forcePutNetworkError = true;
    const a1 = await assets();
    const phases2: string[] = [];
    const f1 = await uploadMedia({
      ...base,
      file: new File([png(1500)], "t.png", { type: "image/png" }),
      onPhase: (p) => phases2.push(p),
    }).catch((e) => e);
    check(
      "network failure -> UploadFailedError with a friendly message",
      f1 instanceof UploadFailedError && /connection/i.test(f1.message),
    );
    check(
      "finalize was NOT called after the failed PUT",
      !state.appCalls.includes("/api/media/upload-finalize") && !phases2.includes("finalizing"),
    );
    check("no Asset created by the failed upload", (await assets()) === a1);
    reset();
    state.forcePutStatus = 403;
    const f2 = await uploadMedia({
      ...base,
      file: new File([png(1500)], "t.png", { type: "image/png" }),
    }).catch((e) => e);
    check(
      "expired/rejected signature (403) -> clear 'try again' message",
      f2 instanceof UploadFailedError && /expired or was rejected/i.test(f2.message),
    );
    check("...and again no finalize call", !state.appCalls.includes("/api/media/upload-finalize"));

    section("Retry requests a FRESH intent (never reuses an expired URL)");
    reset();
    const i0 = await intents();
    state.forcePutStatus = 403;
    await uploadMedia({
      ...base,
      file: new File([png(1200)], "t.png", { type: "image/png" }),
    }).catch(() => undefined);
    state.forcePutStatus = 0;
    const retry = await uploadMedia<{ assetId: string }>({
      ...base,
      file: new File([png(1200)], "t.png", { type: "image/png" }),
    });
    check("retry succeeds", typeof retry.assetId === "string");
    check("each attempt created its own new intent", (await intents()) === i0 + 2);

    section("Cancel");
    reset();
    state.putDelayMs = 400;
    const ctl = new AbortController();
    const a2 = await assets();
    const cancelled = await uploadMedia({
      ...base,
      file: new File([png(1300)], "t.png", { type: "image/png" }),
      signal: ctl.signal,
      onPhase: (p) => {
        if (p === "uploading") setTimeout(() => ctl.abort(), 50);
      },
    }).catch((e) => e);
    check(
      "cancelling during upload -> 'Upload canceled.'",
      cancelled instanceof UploadFailedError && /canceled/i.test(cancelled.message),
    );
    check(
      "cancel never calls finalize and creates no Asset",
      !state.appCalls.includes("/api/media/upload-finalize") && (await assets()) === a2,
    );

    section("Finalize is retried on transient server errors (idempotent)");
    reset();
    state.finalize503 = 2;
    const flaky = await uploadMedia<{ assetId: string }>({
      ...base,
      file: new File([png(1100)], "t.png", { type: "image/png" }),
    });
    check(
      "two 503s on finalize are retried and the upload still completes",
      typeof flaky.assetId === "string",
    );
    const flakyIntent = await prisma.uploadIntent.findFirstOrThrow({
      where: { userId: elena.id },
      orderBy: { createdAt: "desc" },
    });
    check(
      "finalize was attempted 3 times, yet exactly ONE asset exists for that upload",
      state.appCalls.filter((u) => u.endsWith("/upload-finalize")).length === 3 &&
        (await prisma.asset.count({ where: { storageKey: flakyIntent.storageKey } })) === 1,
    );
    check(
      "and the course points at it (replacing the earlier thumbnail, not adding a second)",
      (await prisma.course.findUniqueOrThrow({ where: { id: course.id } })).thumbnailAssetId ===
        flaky.assetId,
    );
    reset();
    state.finalize503 = 5;
    const dead = await uploadMedia({
      ...base,
      file: new File([png(1100)], "t.png", { type: "image/png" }),
    }).catch((e) => e);
    check(
      "persistent finalize failure -> clear error, no false 'complete'",
      dead instanceof UploadFailedError && /try again/i.test(dead.message),
    );

    section("Server messages reach the user");
    reset();
    const other = await prisma.user.findUniqueOrThrow({
      where: { email: "marcus.chen@learnora.dev" },
    });
    const marcusCourse = await prisma.course.findFirstOrThrow({
      where: { instructorId: other.id },
    });
    const denied = await uploadMedia({
      ...base,
      courseId: marcusCourse.id,
      file: new File([png(900)], "t.png", { type: "image/png" }),
    }).catch((e) => e);
    check(
      "uploading to someone else's course -> server's refusal surfaces as UploadFailedError",
      denied instanceof UploadFailedError && denied.message.length > 0 && state.putCalls === 0,
    );

    section("Other purposes through the same client");
    reset();
    const vid = await uploadMedia<{ assetId: string; url: string }>({
      purpose: "LESSON_VIDEO",
      courseId: course.id,
      lessonId: lesson.id,
      legacy: { url: "/unused" },
      file: new File([mp4(300_000)], "v.mp4", { type: "video/mp4" }),
    });
    check(
      "lesson video via the client -> private /media/lesson-video url",
      vid.url.startsWith("/media/lesson-video/"),
    );
    const res = await uploadMedia<{ id: string; downloadUrl: string }>({
      purpose: "LESSON_RESOURCE",
      courseId: course.id,
      lessonId: lesson.id,
      title: "Notes",
      legacy: { url: "/unused" },
      file: new File([new TextEncoder().encode("%PDF-1.4\n" + "x".repeat(1000))], "n.pdf", {
        type: "application/pdf",
      }),
    });
    check(
      "lesson resource via the client -> /media/resource url and a resource id",
      res.downloadUrl.startsWith("/media/resource/") && res.id.length > 0,
    );
    const avatar = await uploadMedia<{ url: string }>({
      purpose: "AVATAR",
      legacy: { url: "/unused" },
      file: new File([png(800)], "me.png", { type: "image/png" }),
    });
    check("avatar via the client -> public url", avatar.url.startsWith("/media/public/"));
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
