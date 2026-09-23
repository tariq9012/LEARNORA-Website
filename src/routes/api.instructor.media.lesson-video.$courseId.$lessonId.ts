import { createFileRoute } from "@tanstack/react-router";

import { requireApprovedInstructorWithCsrf } from "@/server/auth/instructor-guard";
import {
  assertAllowedType,
  assertWithinSizeLimit,
  MAX_SIZE_BYTES,
} from "@/server/media/media-config";
import { mediaErrorResponse } from "@/server/media/media-http";
import { generateStorageKey } from "@/server/media/media-keys";
import { attachLessonVideo, removeLessonVideo } from "@/server/media/media-service";
import { receiveMultipartUpload } from "@/server/media/upload-handler";

export const Route = createFileRoute("/api/instructor/media/lesson-video/$courseId/$lessonId")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const instructor = await requireApprovedInstructorWithCsrf();
          const uploaded = await receiveMultipartUpload(request, {
            maxBytes: MAX_SIZE_BYTES.LESSON_VIDEO,
            deriveStorageKey: ({ filename, mimeType }) => {
              assertAllowedType("LESSON_VIDEO", mimeType, filename);
              return generateStorageKey({
                purpose: "LESSON_VIDEO",
                mimeType,
                courseId: params.courseId,
                lessonId: params.lessonId,
              });
            },
          });
          assertWithinSizeLimit("LESSON_VIDEO", uploaded.sizeBytes);
          const asset = await attachLessonVideo(
            instructor,
            params.courseId,
            params.lessonId,
            uploaded,
          );
          return Response.json(asset);
        } catch (error) {
          return mediaErrorResponse(error);
        }
      },
      DELETE: async ({ params }) => {
        try {
          const instructor = await requireApprovedInstructorWithCsrf();
          await removeLessonVideo(instructor, params.courseId, params.lessonId);
          return Response.json({ ok: true });
        } catch (error) {
          return mediaErrorResponse(error);
        }
      },
    },
  },
});
