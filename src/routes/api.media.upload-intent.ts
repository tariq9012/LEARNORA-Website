import { createFileRoute } from "@tanstack/react-router";

import { requireCurrentUserWithCsrf } from "@/server/auth/guards";
import { requireApprovedInstructor } from "@/server/auth/instructor-guard";
import { createUploadIntent, uploadIntentInputSchema } from "@/server/media/direct-upload-service";
import { mediaErrorResponse, readSmallJsonBody } from "@/server/media/media-http";

/**
 * Phase 18 step 1: the browser sends METADATA ONLY (never the file) and gets a
 * short-lived presigned PUT for one server-chosen key, or { mode: "server" }
 * when STORAGE_PROVIDER=local. State-changing → explicit CSRF guard (this is a
 * server route, not a createServerFn, so it doesn't get the framework's CSRF
 * middleware). Authentication and CSRF run BEFORE the body is even parsed.
 */
export const Route = createFileRoute("/api/media/upload-intent")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const user = await requireCurrentUserWithCsrf();
          const body = await readSmallJsonBody(request);
          const purpose = uploadIntentInputSchema.shape.purpose.safeParse(
            (body as { purpose?: unknown } | null)?.purpose,
          );
          // Everything except an avatar is instructor course media: approved instructors only.
          const actor =
            purpose.success && purpose.data === "AVATAR" ? user : await requireApprovedInstructor();
          const response = await createUploadIntent(actor, body);
          return Response.json(response, { headers: { "cache-control": "no-store" } });
        } catch (error) {
          return mediaErrorResponse(error);
        }
      },
    },
  },
});
