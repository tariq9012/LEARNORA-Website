import { createFileRoute } from "@tanstack/react-router";
import { assertServerMediatedUploadAllowed } from "@/server/media/direct-upload-service";

import { requireCurrentUserWithCsrf } from "@/server/auth/guards";
import {
  assertAllowedType,
  assertWithinSizeLimit,
  MAX_SIZE_BYTES,
} from "@/server/media/media-config";
import { mediaErrorResponse } from "@/server/media/media-http";
import { generateAvatarStorageKey } from "@/server/media/media-keys";
import { attachUserAvatar, removeUserAvatar } from "@/server/media/media-service";
import { receiveMultipartUpload } from "@/server/media/upload-handler";

/**
 * Account avatar upload/remove. Unlike the instructor course-media
 * routes, this is reachable by ANY authenticated role (student,
 * instructor, or admin) — so it uses requireCurrentUserWithCsrf(), the
 * role-agnostic sibling of requireApprovedInstructorWithCsrf(). Same CSRF
 * reasoning applies: this is a server ROUTE (server.handlers), not a
 * createServerFn, so it doesn't get TanStack Start's built-in
 * server-function CSRF middleware automatically.
 */
export const Route = createFileRoute("/api/account/avatar")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const user = await requireCurrentUserWithCsrf();
          // Phase 18: with R2 the file goes browser -> R2 directly (/api/media/upload-intent);
          // this server must never proxy a large body in that mode.
          assertServerMediatedUploadAllowed();
          const uploaded = await receiveMultipartUpload(request, {
            maxBytes: MAX_SIZE_BYTES.AVATAR,
            deriveStorageKey: ({ filename, mimeType }) => {
              assertAllowedType("AVATAR", mimeType, filename);
              return generateAvatarStorageKey(user.id, mimeType);
            },
          });
          assertWithinSizeLimit("AVATAR", uploaded.sizeBytes);
          const asset = await attachUserAvatar(user, uploaded);
          return Response.json(asset);
        } catch (error) {
          return mediaErrorResponse(error);
        }
      },
      DELETE: async () => {
        try {
          const user = await requireCurrentUserWithCsrf();
          await removeUserAvatar(user);
          return Response.json({ ok: true });
        } catch (error) {
          return mediaErrorResponse(error);
        }
      },
    },
  },
});
