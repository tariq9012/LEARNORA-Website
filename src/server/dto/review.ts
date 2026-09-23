export type ReviewDTO = {
  id: string;
  author: string;
  initials: string;
  /** The reviewer's StudentProfile headline, falling back to "Student". */
  role: string;
  rating: number;
  /** "August 2026" style. */
  date: string;
  body: string;
};

/**
 * Whether/how the current visitor can review a course, and their own
 * review if one exists — drives the review form on the course detail
 * page. Kept separate from ReviewDTO (which is for public display of
 * any review) since this also carries an eligibility decision.
 */
export type MyReviewStateDTO =
  | { state: "not_eligible"; reason: string }
  | { state: "can_review" }
  | { state: "already_reviewed"; review: ReviewDTO };
