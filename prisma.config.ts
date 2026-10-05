import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma CLI commands that talk to the database (migrate, db push, studio,
// seed) need a direct, unpooled connection. On Neon this is the connection
// string WITHOUT "-pooler" in the hostname. The app itself connects
// separately at runtime via DATABASE_URL — see src/server/db/client.ts.
//
// `prisma generate` never connects, and it runs on EVERY production build
// (see the "build" script in package.json). It must therefore not fail just
// because DIRECT_URL is absent from the build environment (for example a
// Vercel Preview deployment). When DIRECT_URL is unset the datasource is
// simply omitted: generate works, and any command that really needs a
// database stops with Prisma's own "datasource url is required" error rather
// than silently falling back to the pooled DATABASE_URL (migrations through
// a transaction pooler are not safe).
const directUrl = process.env["DIRECT_URL"];

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  ...(directUrl ? { datasource: { url: directUrl } } : {}),
});
