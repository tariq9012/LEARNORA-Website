import { z } from "zod";

/**
 * Server-only environment variables.
 *
 * IMPORTANT: this module must never be imported from client code — it
 * reads `process.env` directly and will throw if required variables are
 * missing, which is exactly what we want during server startup but not
 * something that should ever run in the browser bundle.
 */
const DEV_PLACEHOLDER_SESSION_SECRET = "dev-only-change-me-dev-only-change-me";

/** Treats `FOO=` (set but blank) the same as unset, so defaults apply. */
const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const envSchema = z
  .object({
    DATABASE_URL: z
      .string({ required_error: "DATABASE_URL is required (see .env.example)" })
      .min(1, "DATABASE_URL cannot be empty")
      .refine(
        (value) => value.startsWith("postgresql://") || value.startsWith("postgres://"),
        "DATABASE_URL must be a postgresql:// connection string",
      ),
    SESSION_SECRET: z
      .string({ required_error: "SESSION_SECRET is required (see .env.example)" })
      .min(32, "SESSION_SECRET must be at least 32 characters"),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    // Phase 16: public base URL of the deployed app (no trailing slash). Used
    // to build absolute links in emails. Required + https in production.
    APP_URL: z.preprocess(
      blankToUndefined,
      z
        .string()
        .url("APP_URL must be a full URL such as https://learnora.example")
        .transform((v) => v.replace(/\/+$/, ""))
        .optional(),
    ),
    // Media storage (see src/server/storage/). "local" = this server's disk
    // (development / single VM with a persistent volume); "s3" = any
    // S3-compatible object store (Cloudflare R2, AWS S3, ...).
    STORAGE_PROVIDER: z.enum(["local", "s3"]).default("local"),
    LOCAL_STORAGE_ROOT: z.string().min(1).default("./storage/uploads"),
    S3_ENDPOINT: z.preprocess(blankToUndefined, z.string().url().optional()),
    S3_REGION: z.preprocess(blankToUndefined, z.string().min(1).default("auto")),
    S3_BUCKET: z.preprocess(blankToUndefined, z.string().min(3).max(63).optional()),
    S3_ACCESS_KEY_ID: z.preprocess(blankToUndefined, z.string().min(1).optional()),
    S3_SECRET_ACCESS_KEY: z.preprocess(blankToUndefined, z.string().min(1).optional()),
    // Explicit acknowledgement that local-disk uploads in production are
    // backed by a persistent volume (otherwise production requires s3).
    ALLOW_LOCAL_STORAGE_IN_PRODUCTION: z.preprocess(
      blankToUndefined,
      z.enum(["true", "false"]).default("false"),
    ),
    // Phase 16 transactional email. "console" only prints (development);
    // "resend" sends through the Resend API, "gmail" uses SMTP. Production requires resend or gmail.
    EMAIL_PROVIDER: z.enum(["console", "resend", "gmail"]).default("console"),
    RESEND_API_KEY: z.preprocess(blankToUndefined, z.string().min(1).optional()),
    EMAIL_FROM: z.preprocess(blankToUndefined, z.string().min(3).optional()),
    // Gmail SMTP (EMAIL_PROVIDER=gmail). GMAIL_PASS must be a 16-character Google
    // "app password" (needs 2-step verification), NEVER the real account password.
    // Spaces are ignored so it can be pasted exactly as Google shows it.
    GMAIL_USER: z.preprocess(
      blankToUndefined,
      z.string().email("GMAIL_USER must be an email address").optional(),
    ),
    GMAIL_PASS: z.preprocess(
      (v) => blankToUndefined(typeof v === "string" ? v.replace(/\s+/g, "") : v),
      z
        .string()
        .regex(
          /^[a-zA-Z]{16}$/,
          "GMAIL_PASS must be a 16-letter Google app password (not your account password)",
        )
        .optional(),
    ),
    // Phase 19: shared secret that authorizes scheduled-job endpoints (Vercel
    // Cron sends it as `Authorization: Bearer <CRON_SECRET>` automatically when
    // this variable exists). Unset = the cron endpoint answers 503 and does
    // nothing (fails closed).
    CRON_SECRET: z.preprocess(blankToUndefined, z.string().min(32).optional()),
    // Phase 19: live-update stream (/api/events). "auto" = on everywhere except
    // Vercel, where an in-memory broker cannot reach other instances and each
    // open stream occupies a function invocation; polling covers updates there.
    REALTIME_SSE: z.preprocess(blankToUndefined, z.enum(["auto", "on", "off"]).default("auto")),
    // Set automatically by Vercel ("1") on its build and runtime. Used only to
    // refuse configurations that cannot work there (see superRefine below).
    VERCEL: z.preprocess(blankToUndefined, z.string().optional()),
    // Phase 9 payments. Only "simulated" (test-mode, no real money moves)
    // is implemented today — see src/server/payments/. Adding a real
    // provider means implementing PaymentProvider and extending this enum;
    // nothing else in the codebase should need to change.
    PAYMENT_PROVIDER: z.enum(["simulated"]).default("simulated"),
    // Phase 10 finance policy — the ONLY place the revenue split and the
    // minimum payout are configured. Read them through
    // src/server/config/finance-policy.ts, never from process.env directly,
    // and never from the client. Unset/blank falls back to the default, so an
    // existing .env keeps working unchanged.
    INSTRUCTOR_REVENUE_SHARE_PERCENT: z.preprocess(
      blankToUndefined,
      z
        .string()
        .regex(
          /^\d{1,3}(\.\d{1,2})?$/,
          "INSTRUCTOR_REVENUE_SHARE_PERCENT must be a plain number with at most 2 decimals, e.g. 70 or 72.5",
        )
        .refine(
          (value) => Number(value) > 0 && Number(value) <= 100,
          "INSTRUCTOR_REVENUE_SHARE_PERCENT must be greater than 0 and at most 100",
        )
        .default("70"),
    ),
    MINIMUM_PAYOUT_AMOUNT: z.preprocess(
      blankToUndefined,
      z
        .string()
        .regex(
          /^\d{1,6}(\.\d{1,2})?$/,
          "MINIMUM_PAYOUT_AMOUNT must be a plain amount with at most 2 decimals, e.g. 50 or 25.50",
        )
        .refine((value) => Number(value) > 0, "MINIMUM_PAYOUT_AMOUNT must be greater than 0")
        .default("50"),
    ),
  })
  .superRefine((env, ctx) => {
    const fail = (path: string, message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

    // Provider-specific settings are checked in EVERY environment once the
    // provider is selected, so a half-configured s3/resend never starts.
    if (env.STORAGE_PROVIDER === "s3") {
      for (const key of ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const) {
        if (!env[key]) fail(key, `${key} is required when STORAGE_PROVIDER=s3`);
      }
    }
    if (env.EMAIL_PROVIDER === "gmail") {
      for (const key of ["GMAIL_USER", "GMAIL_PASS"] as const) {
        if (!env[key]) fail(key, `${key} is required when EMAIL_PROVIDER=gmail`);
      }
    }
    if (env.EMAIL_PROVIDER === "resend") {
      for (const key of ["RESEND_API_KEY", "EMAIL_FROM"] as const) {
        if (!env[key]) fail(key, `${key} is required when EMAIL_PROVIDER=resend`);
      }
    }

    if (env.NODE_ENV === "production") {
      if (!env.APP_URL || !env.APP_URL.startsWith("https://")) {
        fail("APP_URL", "APP_URL must be set to your public https:// URL in production");
      }
      if (env.EMAIL_PROVIDER === "console") {
        fail(
          "EMAIL_PROVIDER",
          "EMAIL_PROVIDER must be resend or gmail in production (console is development-only)",
        );
      }
      if (env.STORAGE_PROVIDER === "local" && env.ALLOW_LOCAL_STORAGE_IN_PRODUCTION !== "true") {
        fail(
          "STORAGE_PROVIDER",
          "Production needs STORAGE_PROVIDER=s3 (local disk is not durable on most hosts). Set ALLOW_LOCAL_STORAGE_IN_PRODUCTION=true only for a single server with a persistent volume",
        );
      }
    }

    // Vercel's filesystem is read-only/ephemeral: ALLOW_LOCAL_STORAGE_IN_PRODUCTION
    // ("I have a persistent volume") can never be true there, so reject it
    // loudly instead of failing later on the first upload.
    if (env.VERCEL && env.STORAGE_PROVIDER === "local") {
      fail(
        "STORAGE_PROVIDER",
        "Vercel has no persistent disk: set STORAGE_PROVIDER=s3 (Cloudflare R2). Local storage cannot work on Vercel",
      );
    }

    if (env.NODE_ENV === "production" && env.SESSION_SECRET === DEV_PLACEHOLDER_SESSION_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SESSION_SECRET"],
        message:
          "SESSION_SECRET is still set to the .env.example placeholder — generate a real secret for production",
      });
    }
  })
  // Development convenience only: production already failed above if APP_URL is unset.
  .transform((env) => ({ ...env, APP_URL: env.APP_URL ?? "http://localhost:3000" }));

export type ServerEnv = z.infer<typeof envSchema>;

/** Validates an arbitrary environment object (used by getServerEnv and by tests). Secrets are never echoed. */
export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    // Only variable names and our own messages — never the submitted values.
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid server environment variables:\n${issues}\n\nCheck your .env file against .env.example.`,
    );
  }
  return parsed.data;
}

let cached: ServerEnv | undefined;

/**
 * Validates and returns the server environment. Throws a readable error
 * listing every missing/invalid variable on first access, rather than
 * failing later with a confusing Prisma/connection error.
 */
export function getServerEnv(): ServerEnv {
  if (cached) return cached;

  cached = parseServerEnv(process.env);
  return cached;
}
