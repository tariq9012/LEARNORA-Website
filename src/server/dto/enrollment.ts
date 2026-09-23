/** Whether/how a student can access a course — drives the course-detail CTA. */
export type EnrollmentStateDTO =
  | { status: "not_enrolled"; free: boolean }
  | { status: "enrolled"; progress: number; completed: boolean };

export type MyLearningCourseDTO = {
  enrollmentId: string;
  courseSlug: string;
  title: string;
  categorySlug: string;
  category: string;
  instructor: string;
  progress: number;
  completed: boolean;
  enrolledAt: string;
  /** Set only once the course is actually completed — see Enrollment.completedAt. */
  completedAt: string | null;
  /** Title of the next incomplete lesson, or null if the course is finished. */
  nextLessonTitle: string | null;
};

export type StudentDashboardLearningDTO = {
  enrolledCount: number;
  completedCount: number;
  /** Up to 3 most-recently-accessed, not-yet-complete enrollments. */
  continueLearning: MyLearningCourseDTO[];
  allEnrollments: MyLearningCourseDTO[];
};
