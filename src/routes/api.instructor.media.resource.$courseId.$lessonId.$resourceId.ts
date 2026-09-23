import { createFileRoute } from "@tanstack/react-router";

import { requireApprovedInstructorWithCsrf } from "@/server/auth/instructor-guard";
import { mediaErrorResponse } from "@/server/media/media-http";
import { removeLessonResource } from "@/server/media/media-service";

export const Route = createFileRoute(
  "/api/instructor/media/resource/$courseId/$lessonId/$resourceId",
)({
  server: {
    handlers: {
      DELETE: async ({ params }) => {
        try {
          const instructor = await requireApprovedInstructorWithCsrf();
          await removeLessonResource(
            instructor,
            params.courseId,
            params.lessonId,
            params.resourceId,
          );
          return Response.json({ ok: true });
        } catch (error) {
          return mediaErrorResponse(error);
        }
      },
    },
  },
});
