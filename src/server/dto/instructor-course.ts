import type { AssetDTO, LessonResourceDTO } from "./media";

export type InstructorCourseListItemDTO = {
  id: string;
  title: string;
  thumbnail: string | null;
  status: "DRAFT" | "PENDING_REVIEW" | "PUBLISHED" | "REJECTED" | "ARCHIVED";
  category: string;
  level: string;
  price: number;
  students: number;
  rating: number;
  reviewCount: number;
  sectionCount: number;
  updatedAt: string;
  rejectionReason: string | null;
  slug: string;
};

export type BuilderLessonDTO = {
  id: string;
  title: string;
  description: string;
  type: "VIDEO" | "ARTICLE" | "QUIZ";
  videoUrl: string;
  content: string;
  duration: number | null;
  isPreview: boolean;
  video: AssetDTO | null;
  resources: LessonResourceDTO[];
};

export type BuilderSectionDTO = {
  id: string;
  title: string;
  description: string;
  lessons: BuilderLessonDTO[];
};

export type CourseBuilderDTO = {
  id: string;
  title: string;
  slug: string;
  subtitle: string;
  description: string;
  categoryId: string;
  categorySlug: string;
  level: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "ALL_LEVELS";
  language: string;
  thumbnail: string;
  previewVideo: string;
  thumbnailAsset: AssetDTO | null;
  previewAsset: AssetDTO | null;
  price: number;
  discountPrice: number | null;
  learningOutcomes: string[];
  requirements: string[];
  targetAudience: string[];
  status: "DRAFT" | "PENDING_REVIEW" | "PUBLISHED" | "REJECTED" | "ARCHIVED";
  rejectionReason: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  publishedAt: string | null;
  updatedAt: string;
  sections: BuilderSectionDTO[];
  /** Whether the instructor is currently allowed to edit metadata/curriculum — false while PENDING_REVIEW or PUBLISHED. */
  editable: boolean;
};

export type CourseCompletenessResult = { complete: true } | { complete: false; issues: string[] };
