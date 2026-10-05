export type InstructorSummaryDTO = {
  id: string;
  name: string;
  initials: string;
  /** InstructorProfile.headline, e.g. "Principal Frontend Engineer, Meridian Labs". */
  title: string;
  expertise: string[];
  rating: number;
  students: number;
  courses: number;
  reviews: number;
  bio: string;
  /** Real uploaded avatar (Phase 13) if set, else the legacy avatar URL, else null — never a placeholder image URL. */
  avatarUrl: string | null;
  /** Built from InstructorProfile.website + socialLinks (Phase 13). Empty until the instructor sets either. */
  social: { label: string; href: string }[];
};
