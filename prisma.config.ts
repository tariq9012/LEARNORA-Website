import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Prisma CLI commands (migrate, db push, introspect) need a direct,
    // unpooled connection. On Neon this is the connection string WITHOUT
    // "-pooler" in the hostname. The app itself connects separately at
    // runtime via DATABASE_URL — see src/server/db/client.ts.
    url: env("DIRECT_URL"),
  },
});
