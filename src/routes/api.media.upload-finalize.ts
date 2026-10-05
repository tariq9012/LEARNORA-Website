import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { requireCurrentUserWithCsrf } from "@/server/auth/guards";
import { requireApprovedInstructor } from "@/server/auth/instructor-guard";
import { UploadIntentError } from "@/server/media/direct-upload-errors";
import { finalizeUpload } from "@/server/media/direct-upload-service";
import { mediaErrorResponse, readSmallJsonBody } from "@/server/media/media-http";

const bodySchema = z.object({ intentId: z.string().min(1).max(64) });

/**
 * Phase 18 step 3. The browser names an INTENT (never a storage key). The server
 * verifies the object in R2 against what it signed, then creates the Asset in a
 * single transaction. Safe to call repeatedly: a second call returns the same
 * result and creates nothing. CSRF-guarded like every other raw mutation.
 */
export const Route = createFileRoute("/api/media/upload-finalize")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const user = await requireCurrentUserWithCsrf();
          const parsed = bodySchema.safeParse(await readSmallJsonBody(request));
          if (!parsed.success) throw new UploadIntentError("Invalid finalize request.");
          const result = await finalizeUpload({
            user,
            intentId: parsed.data.intentId,
            resolveInstructor: requireApprovedInstructor,
          });
          return Response.json(result, { headers: { "cache-control": "no-store" } });
        } catch (error) {
          return mediaErrorResponse(error);
        }
      },
    },
  },
});
