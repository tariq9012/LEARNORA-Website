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
    // Phase 7 media storage. Only "local" is implemented today — see
    // src/server/storage/. A production deployment must add a real
    // object-storage provider and extend this enum when it does.
    STORAGE_PROVIDER: z.enum(["local"]).default("local"),
    LOCAL_STORAGE_ROOT: z.string().min(1).default("./storage/uploads"),
    // Phase 9 payments. Only "simulated" (test-mode, no real money moves)
    // is implemented today — see src/server/payments/. Adding a real
    // provider means implementing PaymentProvider and extending this enum;
    // nothing else in the codebase should need to change.
    PAYMENT_PROVIDER: z.enum(["simulated"]).default("simulated"),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && env.SESSION_SECRET === DEV_PLACEHOLDER_SESSION_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SESSION_SECRET"],
        message:
          "SESSION_SECRET is still set to the .env.example placeholder — generate a real secret for production",
      });
    }
  });

export type ServerEnv = z.infer<typeof envSchema>;

let cached: ServerEnv | undefined;

/**
 * Validates and returns the server environment. Throws a readable error
 * listing every missing/invalid variable on first access, rather than
 * failing later with a confusing Prisma/connection error.
 */
export function getServerEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid server environment variables:\n${issues}\n\nCheck your .env file against .env.example.`,
    );
  }

  cached = parsed.data;
  return cached;
}
