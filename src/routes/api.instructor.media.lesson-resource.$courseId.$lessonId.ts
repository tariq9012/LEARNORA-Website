import { createFileRoute } from "@tanstack/react-router";

import {
  requireApprovedInstructor,
  requireApprovedInstructorWithCsrf,
} from "@/server/auth/instructor-guard";
import {
  assertAllowedType,
  assertWithinSizeLimit,
  MAX_SIZE_BYTES,
} from "@/server/media/media-config";
import { mediaErrorResponse } from "@/server/media/media-http";
import { generateStorageKey } from "@/server/media/media-keys";
import { attachLessonResource, listLessonResourcesForBuilder } from "@/server/media/media-service";
import { receiveMultipartUpload } from "@/server/media/upload-handler";

export const Route = createFileRoute("/api/instructor/media/lesson-resource/$courseId/$lessonId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const instructor = await requireApprovedInstructor();
          const resources = await listLessonResourcesForBuilder(
            instructor,
            params.courseId,
            params.lessonId,
          );
          return Response.json(resources);
        } catch (error) {
          return mediaErrorResponse(error);
        }
      },
      POST: async ({ request, params }) => {
        try {
          const instructor = await requireApprovedInstructorWithCsrf();
          const uploaded = await receiveMultipartUpload(request, {
            maxBytes: MAX_SIZE_BYTES.LESSON_RESOURCE,
            deriveStorageKey: ({ filename, mimeType }) => {
              assertAllowedType("LESSON_RESOURCE", mimeType, filename);
              return generateStorageKey({
                purpose: "LESSON_RESOURCE",
                mimeType,
                courseId: params.courseId,
                lessonId: params.lessonId,
              });
            },
          });
          assertWithinSizeLimit("LESSON_RESOURCE", uploaded.sizeBytes);
          const resource = await attachLessonResource(
            instructor,
            params.courseId,
            params.lessonId,
            uploaded,
            uploaded.fields["title"] ?? uploaded.originalFilename,
          );
          return Response.json(resource);
        } catch (error) {
          return mediaErrorResponse(error);
        }
      },
    },
  },
});
