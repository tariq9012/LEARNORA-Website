/**
 * Creates ONE admin account on purpose. This is the supported way to get the
 * first admin on a real (production) database — the demo seed is NOT meant for
 * that (it creates accounts with known passwords and refuses to run remotely).
 *
 * Usage (PowerShell example):
 *   $env:DIRECT_URL = "<direct, unpooled connection string>"
 *   $env:ADMIN_EMAIL = "you@your-domain.example"
 *   $env:ADMIN_NAME = "Your Name"
 *   $env:ADMIN_PASSWORD = "<a long unique password, 12+ characters>"
 *   npm run admin:create
 *
 * Rules:
 *   - the password is read ONLY from ADMIN_PASSWORD (never hardcoded, never
 *     printed, never accepted on the command line where shell history keeps it)
 *   - create-only: if the email already exists the script stops and changes nothing
 *   - the demo seed passwords are rejected
 *   - connects with DIRECT_URL (falls back to DATABASE_URL)
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { z } from "zod";

import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/server/auth/password";

const KNOWN_DEMO_PASSWORDS = new Set(["Admin123!", "Instructor123!", "Student123!"]);

const inputSchema = z.object({
  email: z
    .string({ required_error: "ADMIN_EMAIL is required" })
    .trim()
    .toLowerCase()
    .email("ADMIN_EMAIL must be a valid email address"),
  name: z
    .string({ required_error: "ADMIN_NAME is required" })
    .trim()
    .min(2, "ADMIN_NAME is required")
    .max(100),
  password: z
    .string({ required_error: "ADMIN_PASSWORD is required" })
    .min(12, "ADMIN_PASSWORD must be at least 12 characters")
    .max(256)
    .refine((v) => !KNOWN_DEMO_PASSWORDS.has(v), "ADMIN_PASSWORD must not be a demo seed password"),
});

async function main() {
  const parsed = inputSchema.safeParse({
    email: process.env["ADMIN_EMAIL"],
    name: process.env["ADMIN_NAME"],
    password: process.env["ADMIN_PASSWORD"],
  });
  if (!parsed.success) {
    // Messages only — never echo the submitted values.
    console.error(
      "Cannot create admin:\n" + parsed.error.issues.map((i) => `  - ${i.message}`).join("\n"),
    );
    process.exitCode = 1;
    return;
  }

  const connectionString = process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"];
  if (!connectionString) {
    console.error("Cannot create admin: set DIRECT_URL (or DATABASE_URL).");
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const { email, name, password } = parsed.data;
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      console.error("An account with that email already exists. Nothing was changed.");
      process.exitCode = 1;
      return;
    }
    await prisma.user.create({
      data: {
        name,
        email,
        passwordHash: await hashPassword(password),
        role: "ADMIN",
        emailVerified: true,
      },
    });
    console.log(
      `Admin account created for ${email}. Sign in at /login, then remove ADMIN_* variables from your shell.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  // Never print the error object: connection errors can contain the host/user.
  console.error("Admin creation failed:", error instanceof Error ? error.name : "unknown error");
  process.exitCode = 1;
});
