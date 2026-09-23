import type { LessonResourceDTO } from "./media";

export type LearningLessonDTO = {
  id: string;
  title: string;
  description: string;
  type: "VIDEO" | "ARTICLE" | "QUIZ";
  duration: string;
  durationSeconds: number | null;
  completed: boolean;
  /** Authorization-aware streaming URL, or null when the lesson has no video yet. */
  videoUrl: string | null;
  /** Saved playback position in seconds, for resume-on-reopen. */
  watchedSeconds: number;
  resources: LessonResourceDTO[];
};

export type LearningSectionDTO = {
  id: string;
  title: string;
  lessons: LearningLessonDTO[];
};

export type CourseLearningDTO = {
  courseSlug: string;
  title: string;
  categorySlug: string;
  instructor: string;
  sections: LearningSectionDTO[];
  completedLessonIds: string[];
  totalLessons: number;
  overallPercent: number;
  courseCompleted: boolean;
  /** Set only once the course is actually completed — see Enrollment.completedAt. */
  completedAt: string | null;
  /** First not-yet-complete lesson, or the last lesson if everything is done. */
  nextLessonId: string | null;
};
