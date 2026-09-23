/**
 * Server-side DTOs for course data. These deliberately mirror the shape of
 * the Phase 1 mock data (src/data/mock.ts) so the existing UI components
 * (CourseCard, CourseCurriculum, etc.) need little to no change — only the
 * data source changes, not the shape the components expect.
 *
 * Plain types only, no runtime imports, safe to import from client code.
 */

export type CourseLevelLabel = "Beginner" | "Intermediate" | "Advanced" | "All levels";

export type CourseCardDTO = {
  /** The course's slug — used as the routing id, e.g. /courses/$slug. */
  id: string;
  title: string;
  categorySlug: string;
  category: string;
  instructor: string;
  level: CourseLevelLabel;
  /** Total curriculum duration, formatted e.g. "14h 30m". */
  duration: string;
  rating: number;
  reviewCount: number;
  /** The price to show prominently — the discount price when one is set. */
  price: number;
  /** The crossed-out price, only present when a discount is active. */
  originalPrice?: number;
  students: number;
  /** Resolved media URL (Asset first, legacy pasted URL fallback), or null if neither is set. */
  thumbnailUrl: string | null;
};

export type CurriculumLessonDTO = {
  id: string;
  title: string;
  duration: string;
  preview: boolean;
  /** Only populated for free-preview lessons on a published course — see media-access-service.ts. */
  previewVideoUrl: string | null;
};

export type CurriculumSectionDTO = {
  id: string;
  title: string;
  lessons: CurriculumLessonDTO[];
};

import type { InstructorSummaryDTO } from "./instructor";
import type { ReviewDTO } from "./review";

export type CourseDetailDTO = CourseCardDTO & {
  subtitle: string;
  description: string;
  language: string;
  /** "August 2026" style — derived from publishedAt/updatedAt. */
  updated: string;
  outcomes: string[];
  requirements: string[];
  curriculum: CurriculumSectionDTO[];
  instructorProfile: InstructorSummaryDTO | null;
  reviews: ReviewDTO[];
  ratingBreakdown: { stars: number; pct: number }[];
  /** Resolved preview-video media URL, or null if none is set. */
  previewVideoUrl: string | null;
};
