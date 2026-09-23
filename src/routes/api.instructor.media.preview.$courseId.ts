import { createFileRoute } from "@tanstack/react-router";

import { requireApprovedInstructorWithCsrf } from "@/server/auth/instructor-guard";
import {
  assertAllowedType,
  assertWithinSizeLimit,
  MAX_SIZE_BYTES,
} from "@/server/media/media-config";
import { mediaErrorResponse } from "@/server/media/media-http";
import { generateStorageKey } from "@/server/media/media-keys";
import { attachCoursePreview, removeCoursePreview } from "@/server/media/media-service";
import { receiveMultipartUpload } from "@/server/media/upload-handler";

export const Route = createFileRoute("/api/instructor/media/preview/$courseId")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const instructor = await requireApprovedInstructorWithCsrf();
          const uploaded = await receiveMultipartUpload(request, {
            maxBytes: MAX_SIZE_BYTES.COURSE_PREVIEW,
            deriveStorageKey: ({ filename, mimeType }) => {
              assertAllowedType("COURSE_PREVIEW", mimeType, filename);
              return generateStorageKey({
                purpose: "COURSE_PREVIEW",
                mimeType,
                courseId: params.courseId,
              });
            },
          });
          assertWithinSizeLimit("COURSE_PREVIEW", uploaded.sizeBytes);
          const asset = await attachCoursePreview(instructor, params.courseId, uploaded);
          return Response.json(asset);
        } catch (error) {
          return mediaErrorResponse(error);
        }
      },
      DELETE: async ({ params }) => {
        try {
          const instructor = await requireApprovedInstructorWithCsrf();
          await removeCoursePreview(instructor, params.courseId);
          return Response.json({ ok: true });
        } catch (error) {
          return mediaErrorResponse(error);
        }
      },
    },
  },
});
