export type AdminCourseQueueItemDTO = {
  id: string;
  title: string;
  instructorName: string;
  category: string;
  price: number;
  sectionCount: number;
  submittedAt: string | null;
};

export type AdminCourseReviewDTO = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  thumbnail: string;
  thumbnailUrl: string | null;
  previewVideoUrl: string | null;
  category: string;
  level: string;
  language: string;
  price: number;
  discountPrice: number | null;
  status: "DRAFT" | "PENDING_REVIEW" | "PUBLISHED" | "REJECTED" | "ARCHIVED";
  instructorName: string;
  instructorHeadline: string;
  instructorApprovalStatus: "PENDING" | "APPROVED" | "REJECTED";
  learningOutcomes: string[];
  requirements: string[];
  sectionCount: number;
  lessonCount: number;
  totalDuration: string;
  submittedAt: string | null;
  sections: {
    id: string;
    title: string;
    lessons: {
      id: string;
      title: string;
      duration: string;
      isPreview: boolean;
      videoUrl: string | null;
      resourceCount: number;
    }[];
  }[];
};
