// Thin re-export so `src/lib/db.ts` stays the conventional import path for
// the Prisma client, while the actual implementation lives alongside the
// rest of the server-side database code in src/server/db.
export { prisma } from "../server/db/client";
