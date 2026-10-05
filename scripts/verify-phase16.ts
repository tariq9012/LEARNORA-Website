/**
 * Phase 16 verification — storage, email, env validation.
 * Refuses any database whose name does not end in "_test".
 *
 * S3 behaviour is tested against `s3rver`, a local FAKE S3 server — it proves
 * our provider speaks the S3 API correctly (multipart, ranges, delete), NOT
 * that a real Cloudflare R2 / AWS bucket works. Resend is tested with an
 * injected fake fetch — NO real email is sent.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
// @ts-expect-error s3rver ships no type declarations
import S3rver from "s3rver";
import { SMTPServer } from "smtp-server";

const dbName = new URL(process.env["DATABASE_URL"] ?? "postgresql://x/none").pathname.slice(1);
if (!dbName.endsWith("_test")) {
  console.error(`Refusing to run: database "${dbName}" does not end with "_test".`);
  process.exit(2);
}

const S3_PORT = 4569;
const scratch = mkdtempSync(join(tmpdir(), "learnora-p16-"));
process.env["STORAGE_PROVIDER"] = "s3";
process.env["S3_ENDPOINT"] = `http://127.0.0.1:${S3_PORT}`;
process.env["S3_REGION"] = "us-east-1";
process.env["S3_BUCKET"] = "learnora-test-bucket";
process.env["S3_ACCESS_KEY_ID"] = "S3RVER";
process.env["S3_SECRET_ACCESS_KEY"] = "S3RVER";
process.env["LOCAL_STORAGE_ROOT"] = join(scratch, "local");

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
async function bytes(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(Buffer.from(c as Buffer));
  return Buffer.concat(chunks);
}

async function main() {
  const { parseServerEnv } = await import("../src/server/env");
  const { S3StorageProvider } = await import("../src/server/storage/s3-storage-provider");
  const { getStorageProviderFor, getStorageProvider } = await import("../src/server/storage");
  const { serveAssetResponse } = await import("../src/server/media/media-serve");
  const { prisma } = await import("../src/server/db/client");
  const { ResendEmailProvider } = await import("../src/server/email/resend-email-provider");
  const { ConsoleEmailProvider } = await import("../src/server/email/console-email-provider");
  const { EmailDeliveryError } = await import("../src/server/email/email-provider");
  const { buildPasswordResetEmail } = await import("../src/server/email/templates");
  const { dispatchPasswordResetEmail } = await import("../src/server/auth/password-reset-mail");

  // ------------------------------------------------------------ env validation
  section("Environment validation");
  const base = {
    DATABASE_URL: "postgresql://u:p@localhost:5432/db",
    SESSION_SECRET: "x".repeat(40),
  };
  const prod = {
    ...base,
    NODE_ENV: "production",
    APP_URL: "https://learnora.example",
    EMAIL_PROVIDER: "resend",
    RESEND_API_KEY: "re_fake_key_for_test",
    EMAIL_FROM: "Learnora <no-reply@learnora.example>",
    STORAGE_PROVIDER: "s3",
    S3_BUCKET: "bucket-name",
    S3_ACCESS_KEY_ID: "id",
    S3_SECRET_ACCESS_KEY: "secret-value-abc",
  };
  const dev = parseServerEnv(base);
  check(
    "dev defaults: local storage + console email",
    dev.STORAGE_PROVIDER === "local" && dev.EMAIL_PROVIDER === "console",
  );
  check("dev APP_URL defaults to localhost", dev.APP_URL === "http://localhost:3000");
  check("valid production config accepted", (await throws(() => parseServerEnv(prod))) === null);
  check(
    "APP_URL trailing slash removed",
    parseServerEnv({ ...prod, APP_URL: "https://a.example/" }).APP_URL === "https://a.example",
  );
  const reject = async (
    label: string,
    over: Record<string, string | undefined>,
    mustMention: string,
  ) => {
    const err = (await throws(() => parseServerEnv({ ...prod, ...over }))) as Error | null;
    check(`rejected: ${label}`, !!err && err.message.includes(mustMention));
    return err;
  };
  await reject("production without APP_URL", { APP_URL: undefined }, "APP_URL");
  await reject("production with http APP_URL", { APP_URL: "http://learnora.example" }, "APP_URL");
  await reject("production with console email", { EMAIL_PROVIDER: "console" }, "EMAIL_PROVIDER");
  await reject("resend without key", { RESEND_API_KEY: undefined }, "RESEND_API_KEY");
  await reject("resend without from", { EMAIL_FROM: undefined }, "EMAIL_FROM");
  await reject("s3 without bucket", { S3_BUCKET: undefined }, "S3_BUCKET");
  await reject("s3 without secret", { S3_SECRET_ACCESS_KEY: undefined }, "S3_SECRET_ACCESS_KEY");
  await reject(
    "production local storage without opt-in",
    { STORAGE_PROVIDER: "local" },
    "STORAGE_PROVIDER",
  );
  check(
    "production local storage allowed with explicit opt-in",
    (await throws(() =>
      parseServerEnv({
        ...prod,
        STORAGE_PROVIDER: "local",
        ALLOW_LOCAL_STORAGE_IN_PRODUCTION: "true",
      }),
    )) === null,
  );
  await reject("unknown storage provider", { STORAGE_PROVIDER: "gcs" }, "STORAGE_PROVIDER");
  const gmailEnv = {
    ...prod,
    EMAIL_PROVIDER: "gmail",
    GMAIL_USER: "me@gmail.com",
    GMAIL_PASS: "abcd efgh ijkl mnop",
    RESEND_API_KEY: undefined,
    EMAIL_FROM: undefined,
  };
  check(
    "gmail accepted in production with app password (spaces ok)",
    (await throws(() => parseServerEnv(gmailEnv))) === null,
  );
  check(
    "gmail app password spaces are stripped",
    parseServerEnv(gmailEnv).GMAIL_PASS === "abcdefghijklmnop",
  );
  const gmailReject = async (
    label: string,
    over: Record<string, string | undefined>,
    mention: string,
  ) => {
    const err = (await throws(() => parseServerEnv({ ...gmailEnv, ...over }))) as Error | null;
    check(`rejected: ${label}`, !!err && err.message.includes(mention));
    return err;
  };
  await gmailReject("gmail without user", { GMAIL_USER: undefined }, "GMAIL_USER");
  await gmailReject("gmail without password", { GMAIL_PASS: undefined }, "GMAIL_PASS");
  const realPw = await gmailReject(
    "gmail with a normal account password",
    { GMAIL_PASS: "My-Real-Password1!" },
    "GMAIL_PASS",
  );
  check(
    "rejected Gmail password is never echoed",
    !!realPw && !realPw.message.includes("My-Real-Password1"),
  );
  await gmailReject("malformed GMAIL_USER", { GMAIL_USER: "not-an-email" }, "GMAIL_USER");
  await reject("unknown email provider", { EMAIL_PROVIDER: "smtp" }, "EMAIL_PROVIDER");
  const leak = (await throws(() =>
    parseServerEnv({ ...prod, S3_BUCKET: undefined, SESSION_SECRET: "short-secret-value" }),
  )) as Error;
  check(
    "validation errors never echo secret values",
    !leak.message.includes("short-secret-value") &&
      !leak.message.includes("secret-value-abc") &&
      !leak.message.includes("re_fake_key_for_test"),
  );
  check(
    "placeholder SESSION_SECRET still rejected in production",
    (await throws(() =>
      parseServerEnv({ ...prod, SESSION_SECRET: "dev-only-change-me-dev-only-change-me" }),
    )) !== null,
  );

  // -------------------------------------------------------------- S3 provider
  section("S3 provider against a local fake S3 (s3rver)");
  const server = new S3rver({
    port: S3_PORT,
    address: "127.0.0.1",
    silent: true,
    directory: join(scratch, "s3"),
    configureBuckets: [{ name: "learnora-test-bucket", configs: [] }],
  });
  await server.run();
  try {
    const s3 = getStorageProviderFor("S3");
    check("S3 provider kind is S3", s3.kind === "S3" && getStorageProvider().kind === "S3");

    const key = `p16/${randomUUID()}.bin`;
    const small = randomBytes(1000);
    const meta = await s3.save(key, small);
    check("save(Buffer) returns size", meta.sizeBytes === 1000);
    check("stat returns size", (await s3.stat(key)).sizeBytes === 1000);
    check("full read round-trips bytes", (await bytes((await s3.read(key)).stream)).equals(small));
    const ranged = await s3.read(key, { start: 100, end: 199 });
    const got = await bytes(ranged.stream);
    check("ranged read returns exactly the slice", got.equals(small.subarray(100, 200)));
    check(
      "ranged read reports range and total size",
      ranged.range?.start === 100 && ranged.range?.end === 199 && ranged.sizeBytes === 1000,
    );

    const bigKey = `p16/${randomUUID()}.mp4`;
    const big = randomBytes(12 * 1024 * 1024);
    const bigMeta = await s3.save(bigKey, Readable.from(big, { objectMode: false }));
    check("multipart stream upload (12 MB) stores full size", bigMeta.sizeBytes === big.length);
    const tail = await bytes(
      (await s3.read(bigKey, { start: big.length - 500, end: big.length - 1 })).stream,
    );
    check(
      "ranged read near the end of a large object",
      tail.equals(big.subarray(big.length - 500)),
    );

    const failKey = `p16/${randomUUID()}.mp4`;
    const bad = new Readable({
      read() {
        this.push(randomBytes(1024));
        this.destroy(new Error("simulated validation failure"));
      },
    });
    check("failed stream upload rejects", (await throws(() => s3.save(failKey, bad))) !== null);
    check("failed upload leaves no object behind", (await throws(() => s3.stat(failKey))) !== null);

    await s3.delete(key);
    check("delete removes the object", (await throws(() => s3.stat(key))) !== null);
    check("delete of a missing key is idempotent", (await throws(() => s3.delete(key))) === null);
    check(
      "stat of a missing key throws",
      (await throws(() => s3.stat(`p16/nope-${randomUUID()}`))) !== null,
    );

    for (const badKey of [
      "../etc/passwd",
      "/abs/path",
      "a/../b",
      "a//b",
      "",
      "trailing/",
      "has space.mp4",
      "a\0b",
    ]) {
      check(
        `unsafe key rejected: ${JSON.stringify(badKey)}`,
        (await throws(() => s3.save(badKey, Buffer.from("x")))) !== null,
      );
    }
    const wrongCreds = new S3StorageProvider({
      bucket: "learnora-test-bucket",
      region: "us-east-1",
      accessKeyId: "WRONG",
      secretAccessKey: "WRONG",
      endpoint: `http://127.0.0.1:${S3_PORT}`,
    });
    void wrongCreds; // s3rver accepts any creds; credential rejection needs a real service (NOT TESTED)

    // --------------------------------------------- per-asset provider + serving
    section("Per-asset provider routing + authorized serving (media-serve)");
    const owner = await prisma.user.findUniqueOrThrow({
      where: { email: "elena.vasquez@learnora.dev" },
    });
    const local = getStorageProviderFor("LOCAL");
    const localBytes = randomBytes(5000);
    const s3Bytes = randomBytes(7000);
    const localKey = `p16/${randomUUID()}.mp4`;
    const s3Key = `p16/${randomUUID()}.mp4`;
    await local.save(localKey, localBytes);
    await s3.save(s3Key, s3Bytes);
    const mk = (storageKey: string, storageProvider: "LOCAL" | "S3", sizeBytes: number) =>
      prisma.asset.create({
        data: {
          ownerId: owner.id,
          storageKey,
          originalFilename: "p16.mp4",
          mimeType: "video/mp4",
          sizeBytes,
          purpose: "LESSON_VIDEO",
          storageProvider,
        },
      });
    const aLocal = await mk(localKey, "LOCAL", localBytes.length);
    const aS3 = await mk(s3Key, "S3", s3Bytes.length);
    check(
      "asset rows record their provider",
      aLocal.storageProvider === "LOCAL" && aS3.storageProvider === "S3",
    );

    const full = await serveAssetResponse(aLocal.id, new Request("http://x/m"));
    check(
      "LOCAL asset still served while STORAGE_PROVIDER=s3",
      full.status === 200 && Buffer.from(await full.arrayBuffer()).equals(localBytes),
    );
    const fullS3 = await serveAssetResponse(aS3.id, new Request("http://x/m"));
    check(
      "S3 asset served through the app (200, full bytes)",
      fullS3.status === 200 && Buffer.from(await fullS3.arrayBuffer()).equals(s3Bytes),
    );
    const part = await serveAssetResponse(
      aS3.id,
      new Request("http://x/m", { headers: { Range: "bytes=1000-1999" } }),
    );
    check("S3 asset Range request -> 206", part.status === 206);
    check(
      "206 has correct Content-Range",
      part.headers.get("content-range") === `bytes 1000-1999/${s3Bytes.length}`,
    );
    check(
      "206 body is the exact slice",
      Buffer.from(await part.arrayBuffer()).equals(s3Bytes.subarray(1000, 2000)),
    );
    const open = await serveAssetResponse(
      aS3.id,
      new Request("http://x/m", { headers: { Range: "bytes=6000-" } }),
    );
    check(
      "open-ended Range on S3 asset",
      open.status === 206 && Buffer.from(await open.arrayBuffer()).equals(s3Bytes.subarray(6000)),
    );
    const partLocal = await serveAssetResponse(
      aLocal.id,
      new Request("http://x/m", { headers: { Range: "bytes=0-99" } }),
    );
    check("LOCAL asset Range request -> 206", partLocal.status === 206);
    const headers = fullS3.headers;
    check("nosniff header present", headers.get("x-content-type-options") === "nosniff");
    check(
      "response never exposes bucket/endpoint/key",
      !JSON.stringify([...headers.entries()]).match(/learnora-test-bucket|127\.0\.0\.1|p16\//),
    );
    const gone = await serveAssetResponse(
      (await mk(`p16/missing-${randomUUID()}.mp4`, "S3", 1)).id,
      new Request("http://x/m"),
    );
    check("missing S3 object -> 404 (not 500)", gone.status === 404);
    await prisma.asset.deleteMany({ where: { storageKey: { startsWith: "p16/" } } });

    // ------------------------------------ real multipart upload -> S3 (handler)
    section("Multipart upload handler writing to S3");
    const { receiveMultipartUpload } = await import("../src/server/media/upload-handler");
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      randomBytes(3000),
    ]);
    const multipart = (name: string, type: string, data: Buffer) => {
      const boundary = `----p16${randomUUID()}`;
      const body = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: ${type}\r\n\r\n`,
        ),
        data,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);
      return new Request("http://x/upload", {
        method: "POST",
        headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
        body,
      });
    };
    let usedKey = "";
    const uploaded = await receiveMultipartUpload(
      multipart("../../evil name.png", "image/png", png),
      {
        maxBytes: 1024 * 1024,
        deriveStorageKey: () => (usedKey = `p16/${randomUUID()}.png`),
      },
    );
    check(
      "valid PNG accepted and stored in S3",
      uploaded.sizeBytes === png.length &&
        (await getStorageProviderFor("S3").stat(usedKey)).sizeBytes === png.length,
    );
    check(
      "storage key is server-generated, not the filename",
      !uploaded.storageKey.includes("evil") && !uploaded.storageKey.includes(".."),
    );
    check("original filename kept only as display metadata", uploaded.originalFilename.length > 0);
    let spoofKey = "";
    const spoof = await throws(() =>
      receiveMultipartUpload(
        multipart("x.png", "image/png", Buffer.from("<html>not a png</html>".repeat(50))),
        {
          maxBytes: 1024 * 1024,
          deriveStorageKey: () => (spoofKey = `p16/${randomUUID()}.png`),
        },
      ),
    );
    check("MIME-spoofed file rejected (magic bytes)", spoof !== null);
    check(
      "rejected upload leaves no object in S3",
      (await throws(() => getStorageProviderFor("S3").stat(spoofKey))) !== null,
    );
    let oversizeKey = "";
    const tooBig = await throws(() =>
      receiveMultipartUpload(
        multipart("b.png", "image/png", Buffer.concat([png, randomBytes(200_000)])),
        {
          maxBytes: 50_000,
          deriveStorageKey: () => (oversizeKey = `p16/${randomUUID()}.png`),
        },
      ),
    );
    check("oversize upload rejected", tooBig !== null);
    check(
      "oversize upload leaves no object in S3",
      (await throws(() => getStorageProviderFor("S3").stat(oversizeKey))) !== null,
    );
    await getStorageProviderFor("S3").delete(usedKey);
  } finally {
    await server.close();
  }

  // -------------------------------------------------------------------- email
  section("Email: templates, Resend provider (fake fetch), console provider");
  const token = "tok_ABC123-xyz";
  const url = `https://learnora.example/reset-password?token=${token}`;
  const mail = buildPasswordResetEmail({ to: "a@b.test", resetUrl: url, expiresInMinutes: 60 });
  check(
    "email has Learnora branding + subject",
    mail.subject.includes("Learnora") && mail.html.includes("Learnora"),
  );
  check(
    "email has CTA link, expiry and ignore-note",
    mail.html.includes(url) && mail.text.includes("1 hour") && /ignore this email/i.test(mail.text),
  );
  check("email has no password/internal-id wording", !/password is|userId|cuid/i.test(mail.text));
  const evil = buildPasswordResetEmail({
    to: "a@b.test",
    resetUrl: 'https://x.test/?a="><script>alert(1)</script>',
    expiresInMinutes: 60,
  });
  check("HTML-escapes the URL (no injected markup)", !evil.html.includes("<script>"));

  const calls: { url: string; init: RequestInit }[] = [];
  const okFetch = (async (u: string, init: RequestInit) => {
    calls.push({ url: u, init });
    return new Response(JSON.stringify({ id: "1" }), { status: 200 });
  }) as unknown as typeof fetch;
  const resend = new ResendEmailProvider(
    "re_fake_key_for_test",
    "Learnora <n@learnora.example>",
    okFetch,
  );
  await resend.send(mail);
  const sent = JSON.parse(String(calls[0]?.init.body));
  check(
    "Resend: POST to api.resend.com with bearer key",
    calls[0]?.url === "https://api.resend.com/emails" &&
      (calls[0]?.init.headers as Record<string, string>)["Authorization"] ===
        "Bearer re_fake_key_for_test",
  );
  check(
    "Resend: payload has from/to/subject/html/text",
    sent.from.includes("Learnora") && sent.to[0] === "a@b.test" && !!sent.html && !!sent.text,
  );

  const failFetch = (async () =>
    new Response('{"message":"secret provider detail re_fake_key_for_test"}', {
      status: 422,
    })) as unknown as typeof fetch;
  const failErr = (await throws(() =>
    new ResendEmailProvider("re_fake_key_for_test", "x@y.z", failFetch).send(mail),
  )) as InstanceType<typeof EmailDeliveryError>;
  check(
    "Resend HTTP failure -> EmailDeliveryError with status only",
    failErr instanceof EmailDeliveryError && failErr.status === 422,
  );
  check(
    "error text contains no key or provider body",
    !failErr.message.includes("re_fake") && !failErr.message.includes("secret provider detail"),
  );
  const netErr = (await throws(() =>
    new ResendEmailProvider("re_fake_key_for_test", "x@y.z", (async () => {
      throw new Error("ECONNRESET with key re_fake_key_for_test");
    }) as unknown as typeof fetch).send(mail),
  )) as Error;
  check(
    "network failure wrapped without internals",
    netErr instanceof EmailDeliveryError &&
      !netErr.message.includes("ECONNRESET") &&
      !netErr.message.includes("re_fake"),
  );

  section("Gmail provider: fake transport + real SMTP protocol round-trip (local fake server)");
  const { GmailEmailProvider } = await import("../src/server/email/gmail-email-provider");
  const sentMails: Record<string, string>[] = [];
  const fakeTransport = { sendMail: async (o: Record<string, string>) => void sentMails.push(o) };
  await new GmailEmailProvider("me@gmail.com", "abcdefghijklmnop", undefined, fakeTransport).send(
    mail,
  );
  check(
    "Gmail: message fields passed to transport",
    sentMails[0]?.["to"] === "a@b.test" &&
      sentMails[0]?.["from"] === "Learnora <me@gmail.com>" &&
      !!sentMails[0]?.["html"] &&
      !!sentMails[0]?.["text"],
  );
  await new GmailEmailProvider(
    "me@gmail.com",
    "abcdefghijklmnop",
    "Custom <c@d.test>",
    fakeTransport,
  ).send(mail);
  check(
    "Gmail: EMAIL_FROM overrides default sender",
    sentMails[1]?.["from"] === "Custom <c@d.test>",
  );
  const authFail = Object.assign(
    new Error("535 5.7.8 Username and Password not accepted for me@gmail.com"),
    { code: "EAUTH" },
  );
  const gErr = (await throws(() =>
    new GmailEmailProvider("me@gmail.com", "abcdefghijklmnop", undefined, {
      sendMail: async () => {
        throw authFail;
      },
    }).send(mail),
  )) as InstanceType<typeof EmailDeliveryError>;
  check(
    "Gmail failure -> EmailDeliveryError with only a short code",
    gErr instanceof EmailDeliveryError && gErr.code === "EAUTH",
  );
  check(
    "Gmail error text has no SMTP response, user or password",
    !gErr.message.includes("535") &&
      !gErr.message.includes("me@gmail.com") &&
      !gErr.message.includes("abcdefgh"),
  );
  const weird = (await throws(() =>
    new GmailEmailProvider("me@gmail.com", "abcdefghijklmnop", undefined, {
      sendMail: async () => {
        throw Object.assign(new Error("x"), { code: "password=hunter2 leaked!" });
      },
    }).send(mail),
  )) as InstanceType<typeof EmailDeliveryError>;
  check(
    "Gmail: non-code error strings are dropped",
    weird.code === undefined && !weird.message.includes("hunter2"),
  );

  const received: string[] = [];
  const smtp = new SMTPServer({
    authOptional: false,
    allowInsecureAuth: true,
    disabledCommands: ["STARTTLS"],
    onAuth(auth, _session, cb) {
      if (auth.username === "me@gmail.com" && auth.password === "abcdefghijklmnop")
        cb(null, { user: 1 });
      else cb(new Error("Invalid login"));
    },
    onData(stream, _session, cb) {
      const chunks: Buffer[] = [];
      stream.on("data", (c: Buffer) => chunks.push(c));
      stream.on("end", () => {
        received.push(Buffer.concat(chunks).toString("utf8"));
        cb();
      });
    },
  });
  await new Promise<void>((resolve) => smtp.listen(4587, "127.0.0.1", resolve));
  try {
    const overrides = { host: "127.0.0.1", port: 4587, secure: false };
    await new GmailEmailProvider(
      "me@gmail.com",
      "abcdefghijklmnop",
      undefined,
      undefined,
      overrides,
    ).send(mail);
    // nodemailer encodes bodies as quoted-printable: undo soft line breaks and =3D.
    const raw = (received[0] ?? "").replace(/=\r?\n/g, "").replace(/=3D/g, "=");
    check("SMTP: authenticated delivery accepted by server", received.length === 1);
    check(
      "SMTP: wire message has subject, recipient and reset link",
      raw.includes("Subject: Reset your Learnora password") &&
        raw.includes("a@b.test") &&
        raw.includes("reset-password?token=tok_ABC123-xyz"),
    );
    const bad = (await throws(() =>
      new GmailEmailProvider(
        "me@gmail.com",
        "wrongwrongwrongw",
        undefined,
        undefined,
        overrides,
      ).send(mail),
    )) as InstanceType<typeof EmailDeliveryError>;
    check(
      "SMTP: wrong app password rejected as EAUTH, nothing delivered",
      bad instanceof EmailDeliveryError && bad.code === "EAUTH" && received.length === 1,
    );
    check(
      "SMTP: failure text leaks nothing",
      !bad.message.includes("wrongwrong") && !bad.message.includes("Invalid login"),
    );
  } finally {
    await new Promise<void>((resolve) => smtp.close(() => resolve()));
  }

  const origLog = console.log;
  const origError = console.error;
  const logged: string[] = [];
  console.log = (...a: unknown[]) => void logged.push(a.join(" "));
  console.error = (...a: unknown[]) => void logged.push(a.join(" "));
  try {
    await new ConsoleEmailProvider().send(mail);
    const devOut = logged.join("\n");
    check("console provider prints the reset link in development", devOut.includes(url));
    const prevEnv = process.env["NODE_ENV"];
    (process.env as Record<string, string>)["NODE_ENV"] = "production";
    const prodErr = await throws(() => new ConsoleEmailProvider().send(mail));
    (process.env as Record<string, string>)["NODE_ENV"] = prevEnv ?? "test";
    check("console provider refuses to run in production", prodErr !== null);

    logged.length = 0;
    const throwing = {
      name: "resend" as const,
      send: async () => {
        throw new EmailDeliveryError("resend", 500);
      },
    };
    const result = await dispatchPasswordResetEmail(
      { id: "user_1", email: "victim@b.test" },
      "SECRET_TOKEN_VALUE",
      throwing,
      "https://learnora.example",
    );
    const errOut = logged.join("\n");
    check("dispatch swallows provider failure (caller never sees it)", result === undefined);
    check(
      "failure log has provider+status but no token or address",
      errOut.includes("status=500") &&
        !errOut.includes("SECRET_TOKEN_VALUE") &&
        !errOut.includes("victim@b.test"),
    );

    let captured = "";
    const capture = {
      name: "console" as const,
      send: async (m: { text: string }) => {
        captured = m.text;
      },
    };
    await dispatchPasswordResetEmail(
      { id: "u", email: "a@b.test" },
      "a b&c",
      capture,
      "https://learnora.example",
    );
    check(
      "dispatch builds link from APP_URL with encoded token",
      captured.includes("https://learnora.example/reset-password?token=a%20b%26c"),
    );
  } finally {
    console.log = origLog;
    console.error = origError;
  }

  await prisma.$disconnect();
}

main()
  .catch((e) => {
    failed++;
    failures.push(`unexpected: ${e instanceof Error ? e.stack : String(e)}`);
    console.error(e);
  })
  .finally(() => {
    rmSync(scratch, { recursive: true, force: true });
    console.log(`\n${passed} passed, ${failed} failed`);
    if (failures.length) console.log("Failures:\n - " + failures.join("\n - "));
    process.exit(failed ? 1 : 0);
  });
