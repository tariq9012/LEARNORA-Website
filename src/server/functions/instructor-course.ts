import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { ForbiddenError, UnauthorizedError, requireInstructor } from "../auth/guards";
import { requireApprovedInstructor, getMyInstructorApprovalStatus } from "../auth/instructor-guard";
import {
  CourseOwnershipError,
  CourseStateError,
  archiveCourse,
  createDraftCourse,
  createLesson,
  createSection,
  deleteDraftCourse,
  deleteLesson,
  deleteSection,
  getCompleteness,
  getCourseForBuilder,
  getInstructorCourses,
  reorderLessons,
  reorderSections,
  submitCourseForReview,
  updateCourseMetadata,
  updateLesson,
  updateSection,
} from "../services/instructor-course-service";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string> };

function toActionError(error: unknown): {
  success: false;
  error: string;
  fieldErrors?: Record<string, string>;
} {
  if (error instanceof z.ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of error.issues) {
      const key = issue.path.join(".") || "form";
      if (!(key in fieldErrors)) fieldErrors[key] = issue.message;
    }
    return { success: false, error: "Please fix the highlighted fields.", fieldErrors };
  }
  if (error instanceof UnauthorizedError) {
    return { success: false, error: "Please log in to continue." };
  }
  if (error instanceof ForbiddenError) {
    return { success: false, error: error.message };
  }
  if (error instanceof CourseOwnershipError || error instanceof CourseStateError) {
    return { success: false, error: error.message };
  }
  console.error("[instructor-course] unexpected error", error);
  return { success: false, error: "Something went wrong. Please try again." };
}

const courseIdSchema = z.object({ courseId: z.string().min(1) });
const sectionIdSchema = z.object({ courseId: z.string().min(1), sectionId: z.string().min(1) });
const lessonIdSchema = z.object({ courseId: z.string().min(1), lessonId: z.string().min(1) });

// ---------------------------------------------------------------------------
// Listing / builder read
// ---------------------------------------------------------------------------

export const getInstructorCoursesFn = createServerFn({ method: "GET" }).handler(async () => {
  const instructor = await requireInstructor();
  return getInstructorCourses(instructor);
});

export const getMyInstructorApprovalStatusFn = createServerFn({ method: "GET" }).handler(
  async () => {
    return getMyInstructorApprovalStatus();
  },
);

export const getInstructorCourseFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => courseIdSchema.parse(data))
  .handler(
    async ({ data }): Promise<ActionResult<Awaited<ReturnType<typeof getCourseForBuilder>>>> => {
      try {
        const instructor = await requireInstructor();
        const course = await getCourseForBuilder(instructor, data.courseId);
        return { success: true, data: course };
      } catch (error) {
        return toActionError(error);
      }
    },
  );

// ---------------------------------------------------------------------------
// Course metadata
// ---------------------------------------------------------------------------

export const createInstructorCourseFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data)
  .handler(async ({ data }): Promise<ActionResult<{ id: string }>> => {
    try {
      const instructor = await requireApprovedInstructor();
      const result = await createDraftCourse(instructor, data);
      return { success: true, data: result };
    } catch (error) {
      return toActionError(error);
    }
  });

export const updateInstructorCourseFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ courseId: z.string().min(1), fields: z.unknown() }).parse(data),
  )
  .handler(async ({ data }): Promise<ActionResult<null>> => {
    try {
      const instructor = await requireApprovedInstructor();
      await updateCourseMetadata(instructor, data.courseId, data.fields);
      return { success: true, data: null };
    } catch (error) {
      return toActionError(error);
    }
  });

export const deleteInstructorCourseFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => courseIdSchema.parse(data))
  .handler(async ({ data }): Promise<ActionResult<null>> => {
    try {
      const instructor = await requireApprovedInstructor();
      await deleteDraftCourse(instructor, data.courseId);
      return { success: true, data: null };
    } catch (error) {
      return toActionError(error);
    }
  });

export const archiveInstructorCourseFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => courseIdSchema.parse(data))
  .handler(async ({ data }): Promise<ActionResult<null>> => {
    try {
      const instructor = await requireApprovedInstructor();
      await archiveCourse(instructor, data.courseId);
      return { success: true, data: null };
    } catch (error) {
      return toActionError(error);
    }
  });

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

export const createSectionFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ courseId: z.string().min(1), fields: z.unknown() }).parse(data),
  )
  .handler(async ({ data }): Promise<ActionResult<{ id: string }>> => {
    try {
      const instructor = await requireApprovedInstructor();
      const section = await createSection(instructor, data.courseId, data.fields);
      return { success: true, data: { id: section.id } };
    } catch (error) {
      return toActionError(error);
    }
  });

export const updateSectionFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({ courseId: z.string().min(1), sectionId: z.string().min(1), fields: z.unknown() })
      .parse(data),
  )
  .handler(async ({ data }): Promise<ActionResult<null>> => {
    try {
      const instructor = await requireApprovedInstructor();
      await updateSection(instructor, data.courseId, data.sectionId, data.fields);
      return { success: true, data: null };
    } catch (error) {
      return toActionError(error);
    }
  });

export const deleteSectionFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => sectionIdSchema.parse(data))
  .handler(async ({ data }): Promise<ActionResult<null>> => {
    try {
      const instructor = await requireApprovedInstructor();
      await deleteSection(instructor, data.courseId, data.sectionId);
      return { success: true, data: null };
    } catch (error) {
      return toActionError(error);
    }
  });

export const reorderSectionsFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ courseId: z.string().min(1), orderedIds: z.array(z.string()) }).parse(data),
  )
  .handler(async ({ data }): Promise<ActionResult<null>> => {
    try {
      const instructor = await requireApprovedInstructor();
      await reorderSections(instructor, data.courseId, { orderedIds: data.orderedIds });
      return { success: true, data: null };
    } catch (error) {
      return toActionError(error);
    }
  });

// ---------------------------------------------------------------------------
// Lessons
// ---------------------------------------------------------------------------

export const createLessonFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({ courseId: z.string().min(1), sectionId: z.string().min(1), fields: z.unknown() })
      .parse(data),
  )
  .handler(async ({ data }): Promise<ActionResult<{ id: string }>> => {
    try {
      const instructor = await requireApprovedInstructor();
      const lesson = await createLesson(instructor, data.courseId, data.sectionId, data.fields);
      return { success: true, data: { id: lesson.id } };
    } catch (error) {
      return toActionError(error);
    }
  });

export const updateLessonFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({ courseId: z.string().min(1), lessonId: z.string().min(1), fields: z.unknown() })
      .parse(data),
  )
  .handler(async ({ data }): Promise<ActionResult<null>> => {
    try {
      const instructor = await requireApprovedInstructor();
      await updateLesson(instructor, data.courseId, data.lessonId, data.fields);
      return { success: true, data: null };
    } catch (error) {
      return toActionError(error);
    }
  });

export const deleteLessonFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => lessonIdSchema.parse(data))
  .handler(async ({ data }): Promise<ActionResult<null>> => {
    try {
      const instructor = await requireApprovedInstructor();
      await deleteLesson(instructor, data.courseId, data.lessonId);
      return { success: true, data: null };
    } catch (error) {
      return toActionError(error);
    }
  });

export const reorderLessonsFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        courseId: z.string().min(1),
        sectionId: z.string().min(1),
        orderedIds: z.array(z.string()),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<ActionResult<null>> => {
    try {
      const instructor = await requireApprovedInstructor();
      await reorderLessons(instructor, data.courseId, data.sectionId, {
        orderedIds: data.orderedIds,
      });
      return { success: true, data: null };
    } catch (error) {
      return toActionError(error);
    }
  });

// ---------------------------------------------------------------------------
// Submit for review
// ---------------------------------------------------------------------------

export const getCourseCompletenessFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => courseIdSchema.parse(data))
  .handler(async ({ data }) => {
    const instructor = await requireApprovedInstructor();
    return getCompleteness(instructor, data.courseId);
  });

export const submitCourseForReviewFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => courseIdSchema.parse(data))
  .handler(async ({ data }): Promise<ActionResult<null>> => {
    try {
      const instructor = await requireApprovedInstructor();
      await submitCourseForReview(instructor, data.courseId);
      return { success: true, data: null };
    } catch (error) {
      return toActionError(error);
    }
  });
