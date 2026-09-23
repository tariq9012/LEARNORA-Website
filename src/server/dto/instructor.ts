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
  /** No social links are collected yet — always empty until that's added. */
  social: { label: string; href: string }[];
};
