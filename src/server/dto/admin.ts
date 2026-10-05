/**
 * Phase 14 admin DTOs. Money fields are plain numbers rounded to 2
 * decimals at the service boundary (unlike Phase 10's earnings DTOs,
 * which use string Decimals for payout-affecting figures) — these are
 * dashboard/reporting numbers, never inputs to a financial mutation.
 */

export type AdminDashboardDTO = {
  totalUsers: number;
  activeStudents: number;
  instructors: number;
  pendingInstructorApprovals: number;
  totalCourses: number;
  publishedCourses: number;
  pendingCourseReviews: number;
  activeEnrollments: number;
  completedEnrollments: number;
  paidPayments: number;
  processedRefunds: number;
  refundedAmount: number;
  /** Sum of PAID payments only — see payment-repository.ts's aggregatePaid() for the exact formula and why refunds never need subtracting separately. */
  platformRevenue: number;
  currency: string;
  revenueByMonth: { month: string; value: number }[];
  pendingCourses: { id: string; title: string; instructorName: string }[];
};

export type AdminRecentPaymentDTO = {
  id: string;
  orderNumber: string;
  studentName: string;
  courseTitle: string;
  amount: number;
  currency: string;
  status: "PENDING" | "PAID" | "FAILED" | "REFUNDED" | "PARTIALLY_REFUNDED";
  createdAt: string;
};

export type AdminCourseListItemDTO = {
  id: string;
  title: string;
  slug: string;
  status: "DRAFT" | "PENDING_REVIEW" | "PUBLISHED" | "REJECTED" | "ARCHIVED";
  price: number;
  currency: string;
  categoryName: string | null;
  instructorId: string;
  instructorName: string;
  enrollmentCount: number;
  averageRating: number | null;
  reviewCount: number;
  createdAt: string;
  publishedAt: string | null;
};

export type AdminCourseListDTO = {
  courses: AdminCourseListItemDTO[];
  total: number;
  page: number;
  pageSize: number;
};

export type AdminInstructorDTO = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  approvalStatus: "PENDING" | "APPROVED" | "REJECTED";
  rejectionReason: string | null;
  joinedAt: string;
  courseCount: number;
  publishedCourseCount: number;
  studentCount: number;
  averageRating: number | null;
};

export type AdminInstructorListDTO = {
  instructors: AdminInstructorDTO[];
  total: number;
  page: number;
  pageSize: number;
};

export type AdminEnrollmentDTO = {
  id: string;
  studentName: string;
  courseTitle: string;
  courseId: string;
  instructorName: string;
  status: "ACTIVE" | "COMPLETED" | "CANCELLED";
  enrolledAt: string;
  completedAt: string | null;
  progressPercent: number;
};

export type AdminEnrollmentListDTO = {
  enrollments: AdminEnrollmentDTO[];
  total: number;
  page: number;
  pageSize: number;
};

export type AdminReviewDTO = {
  id: string;
  courseId: string;
  courseTitle: string;
  reviewerName: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  hidden: boolean;
};

export type AdminReviewListDTO = {
  reviews: AdminReviewDTO[];
  total: number;
  page: number;
  pageSize: number;
};

export type AdminCategoryDTO = {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: "ACTIVE" | "INACTIVE";
  courseCount: number;
};

// ---------------------------------------------------------------------------
// Instructor-facing DTOs (Phase 14). Privacy-minimizing by design: no
// student email, billing, messages or report data.
// ---------------------------------------------------------------------------

export type InstructorStudentDTO = {
  id: string;
  studentName: string;
  avatarUrl: string | null;
  courseId: string;
  courseTitle: string;
  status: "ACTIVE" | "COMPLETED" | "CANCELLED";
  enrolledAt: string;
  completedAt: string | null;
  progressPercent: number;
};

export type InstructorStudentListDTO = {
  students: InstructorStudentDTO[];
  total: number;
  page: number;
  pageSize: number;
};

export type InstructorReviewDTO = {
  id: string;
  courseId: string;
  courseTitle: string;
  reviewerName: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  /** Observational only — instructors see that a review is hidden, never why, and never any report/admin-note detail. */
  hidden: boolean;
};

export type InstructorReviewListDTO = {
  reviews: InstructorReviewDTO[];
  total: number;
  page: number;
  pageSize: number;
};

export type InstructorCoursePerformanceDTO = {
  courseId: string;
  title: string;
  status: "DRAFT" | "PENDING_REVIEW" | "PUBLISHED" | "REJECTED" | "ARCHIVED";
  enrollments: number;
  completions: number;
  averageRating: number | null;
  reviewCount: number;
  earnings: number;
};

export type InstructorAnalyticsDTO = {
  totalCourses: number;
  publishedCourses: number;
  totalStudents: number;
  completions: number;
  averageRating: number | null;
  reviewCount: number;
  /** All persisted, non-reversed earnings (available + reserved + paid). */
  totalEarnings: number;
  availableEarnings: number;
  paidEarnings: number;
  currency: string;
  earningsByMonth: { month: string; value: number }[];
  enrollmentsByMonth: { month: string; value: number }[];
  ratingDistribution: { rating: number; count: number }[];
  courses: InstructorCoursePerformanceDTO[];
};

// ---------------------------------------------------------------------------
// Phase 15
// ---------------------------------------------------------------------------

/**
 * Admin user row. Explicit allow-list: no passwordHash, sessions, reset
 * tokens, messages or billing data can ever reach this shape. Email is
 * included because an admin needs it to identify an account.
 */
export type AdminUserDTO = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: "STUDENT" | "INSTRUCTOR" | "ADMIN";
  status: "ACTIVE" | "SUSPENDED" | "BANNED";
  emailVerified: boolean;
  joinedAt: string;
  /** Instructor accounts only — null for everyone else. */
  instructorApproval: "PENDING" | "APPROVED" | "REJECTED" | null;
  /** True when the signed-in admin may change this account's status (never self, never another admin). */
  statusEditable: boolean;
};

export type AdminUserListDTO = {
  users: AdminUserDTO[];
  total: number;
  page: number;
  pageSize: number;
};

/**
 * Admin student row.
 *  enrollmentCount = ACTIVE + COMPLETED enrolments (cancelled/refunded excluded)
 *  netSpend        = SUM(Order.amount) for the student's orders whose status is PAID.
 *                    Persisted order amounts, never current course prices; a refunded
 *                    order flips to REFUNDED in the same transaction and stops counting.
 */
export type AdminStudentDTO = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  status: "ACTIVE" | "SUSPENDED" | "BANNED";
  joinedAt: string;
  headline: string | null;
  enrollmentCount: number;
  activeEnrollments: number;
  completedCourses: number;
  certificateCount: number;
  netSpend: number;
  currency: string;
};

export type AdminStudentListDTO = {
  students: AdminStudentDTO[];
  total: number;
  page: number;
  pageSize: number;
};
