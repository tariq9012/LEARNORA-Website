import { createFileRoute } from "@tanstack/react-router";

import { requireApprovedInstructorWithCsrf } from "@/server/auth/instructor-guard";
import {
  assertAllowedType,
  assertWithinSizeLimit,
  MAX_SIZE_BYTES,
} from "@/server/media/media-config";
import { mediaErrorResponse } from "@/server/media/media-http";
import { generateStorageKey } from "@/server/media/media-keys";
import { attachCourseThumbnail, removeCourseThumbnail } from "@/server/media/media-service";
import { receiveMultipartUpload } from "@/server/media/upload-handler";

export const Route = createFileRoute("/api/instructor/media/thumbnail/$courseId")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const instructor = await requireApprovedInstructorWithCsrf();
          const uploaded = await receiveMultipartUpload(request, {
            maxBytes: MAX_SIZE_BYTES.COURSE_THUMBNAIL,
            deriveStorageKey: ({ filename, mimeType }) => {
              assertAllowedType("COURSE_THUMBNAIL", mimeType, filename);
              return generateStorageKey({
                purpose: "COURSE_THUMBNAIL",
                mimeType,
                courseId: params.courseId,
              });
            },
          });
          assertWithinSizeLimit("COURSE_THUMBNAIL", uploaded.sizeBytes);
          const asset = await attachCourseThumbnail(instructor, params.courseId, uploaded);
          return Response.json(asset);
        } catch (error) {
          return mediaErrorResponse(error);
        }
      },
      DELETE: async ({ params }) => {
        try {
          const instructor = await requireApprovedInstructorWithCsrf();
          await removeCourseThumbnail(instructor, params.courseId);
          return Response.json({ ok: true });
        } catch (error) {
          return mediaErrorResponse(error);
        }
      },
    },
  },
});
