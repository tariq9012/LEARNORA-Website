import type { PurchaseHistoryItemDTO } from "./checkout";

/**
 * PRIVATE — the signed-in student's own profile. Never returned for any
 * user other than the caller (see profile-service.ts guards).
 */
export type StudentProfileDTO = {
  bio: string;
  headline: string;
  interests: string[];
  learningGoals: string;
  preferredLanguage: string;
  website: string;
  location: string;
};

/**
 * PRIVATE — the signed-in instructor's own profile, including
 * server-controlled fields (approvalStatus, rejectionReason) that the
 * edit form must show as read-only. Never conflate this with
 * InstructorSummaryDTO (dto/instructor.ts), which is the PUBLIC shape
 * shown to other users.
 */
export type InstructorPrivateProfileDTO = {
  headline: string;
  bio: string;
  expertise: string[];
  yearsExperience: number | null;
  website: string;
  socialLinks: Record<string, string>;
  approvalStatus: "PENDING" | "APPROVED" | "REJECTED";
  rejectionReason: string | null;
};

/** PRIVATE — one row of "Active sessions". Never includes the raw token or its hash. */
export type SessionDTO = {
  id: string;
  isCurrent: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  userAgent: string | null;
};

/** PRIVATE — everything the account/settings page needs about the signed-in user, in one call. */
export type AccountOverviewDTO = {
  id: string;
  name: string;
  email: string;
  role: "STUDENT" | "INSTRUCTOR" | "ADMIN";
  status: "ACTIVE" | "SUSPENDED" | "BANNED";
  emailVerified: boolean;
  joinedAt: string;
  avatarUrl: string | null;
  studentProfile: StudentProfileDTO | null;
  instructorProfile: InstructorPrivateProfileDTO | null;
};

/** PRIVATE — compact billing view for Settings → Billing. Built from the same Order data as /student/purchases, never a second ledger. */
export type BillingSummaryDTO = {
  totalOrders: number;
  totalSpent: number;
  currency: string;
  recent: PurchaseHistoryItemDTO[];
};
