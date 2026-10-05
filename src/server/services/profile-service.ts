import * as profileRepository from "../repositories/profile-repository";
import * as userRepository from "../repositories/user-repository";
import { publicAssetUrl } from "../media/media-urls";
import { instructorProfileInputSchema, studentProfileInputSchema } from "../validation/user";
import type { SafeUser } from "../auth/types";
import type {
  AccountOverviewDTO,
  InstructorPrivateProfileDTO,
  StudentProfileDTO,
} from "../dto/account";

export class ProfileError extends Error {}

/** Prefer the real uploaded avatar; fall back to the legacy URL column; null if neither is set. Same pattern as Course.thumbnail/thumbnailAssetId. */
function avatarUrlOf(account: {
  avatarAssetId: string | null;
  avatar: string | null;
}): string | null {
  return account.avatarAssetId ? publicAssetUrl(account.avatarAssetId) : account.avatar;
}

/** An optional-string form field: "" or undefined both mean "clear this field" (stored as null), never an empty-string row value. */
function toNullable(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  return value.trim() === "" ? null : value;
}

/** Drops keys whose value is undefined so Prisma treats them as "leave unchanged" (and exactOptionalPropertyTypes is satisfied). */
function definedOnly<T extends Record<string, unknown>>(
  obj: T,
): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as {
    [K in keyof T]?: Exclude<T[K], undefined>;
  };
}

function toStudentProfileDTO(
  profile: {
    bio: string | null;
    headline: string | null;
    interests: string[];
    learningGoals: string | null;
    preferredLanguage: string | null;
    website: string | null;
    location: string | null;
  } | null,
): StudentProfileDTO | null {
  if (!profile) return null;
  return {
    bio: profile.bio ?? "",
    headline: profile.headline ?? "",
    interests: profile.interests,
    learningGoals: profile.learningGoals ?? "",
    preferredLanguage: profile.preferredLanguage ?? "",
    website: profile.website ?? "",
    location: profile.location ?? "",
  };
}

function toInstructorPrivateProfileDTO(
  profile: {
    headline: string | null;
    bio: string | null;
    expertise: string[];
    yearsExperience: number | null;
    website: string | null;
    socialLinks: unknown;
    approvalStatus: "PENDING" | "APPROVED" | "REJECTED";
    rejectionReason: string | null;
  } | null,
): InstructorPrivateProfileDTO | null {
  if (!profile) return null;
  const socialLinks =
    profile.socialLinks &&
    typeof profile.socialLinks === "object" &&
    !Array.isArray(profile.socialLinks)
      ? (profile.socialLinks as Record<string, string>)
      : {};
  return {
    headline: profile.headline ?? "",
    bio: profile.bio ?? "",
    expertise: profile.expertise,
    yearsExperience: profile.yearsExperience,
    website: profile.website ?? "",
    socialLinks,
    approvalStatus: profile.approvalStatus,
    rejectionReason: profile.rejectionReason,
  };
}

export async function getMyAccount(user: SafeUser): Promise<AccountOverviewDTO> {
  const account = await profileRepository.findAccountByUserId(user.id);
  if (!account) throw new ProfileError("Account not found.");

  return {
    id: account.id,
    name: account.name,
    email: account.email,
    role: account.role,
    status: account.status,
    emailVerified: account.emailVerified,
    joinedAt: account.createdAt.toISOString(),
    avatarUrl: avatarUrlOf(account),
    studentProfile: toStudentProfileDTO(account.studentProfile),
    instructorProfile: toInstructorPrivateProfileDTO(account.instructorProfile),
  };
}

/**
 * Updates the CALLER's own name only — never accepts a userId, so there is
 * no cross-account write surface here (see assertOwnsResourceOrAdmin's
 * reasoning in guards.ts; this doesn't even need it, since `user.id` is
 * the only id ever used).
 */
export async function updateMyAccountName(user: SafeUser, name: string): Promise<void> {
  await userRepository.updateUserName(user.id, name);
}

/** Student edits only their own StudentProfile — enforced simply by never accepting any id but the caller's. */
export async function updateMyStudentProfile(
  user: SafeUser,
  input: unknown,
): Promise<StudentProfileDTO> {
  if (user.role !== "STUDENT") {
    throw new ProfileError("Only student accounts have a student profile.");
  }
  const data = studentProfileInputSchema.parse(input);
  const updated = await profileRepository.updateStudentProfile(
    user.id,
    definedOnly({
      bio: toNullable(data.bio),
      headline: toNullable(data.headline),
      interests: data.interests,
      learningGoals: toNullable(data.learningGoals),
      preferredLanguage: toNullable(data.preferredLanguage),
      website: toNullable(data.website),
      location: toNullable(data.location),
    }),
  );
  return toStudentProfileDTO(updated)!;
}

/**
 * Instructor edits only their own InstructorProfile, and only the fields
 * in instructorProfileInputSchema — approvalStatus, rejectionReason,
 * averageRating, totalStudents and totalCourses are server-controlled and
 * simply never appear in the input schema, so there is no way for this
 * call to touch them (see Phase 13 spec item 4/7).
 */
export async function updateMyInstructorProfile(
  user: SafeUser,
  input: unknown,
): Promise<InstructorPrivateProfileDTO> {
  if (user.role !== "INSTRUCTOR") {
    throw new ProfileError("Only instructor accounts have an instructor profile.");
  }
  const data = instructorProfileInputSchema.parse(input);
  const updated = await profileRepository.updateInstructorProfile(
    user.id,
    definedOnly({
      headline: toNullable(data.headline),
      bio: toNullable(data.bio),
      expertise: data.expertise,
      yearsExperience: data.yearsExperience,
      website: toNullable(data.website),
      socialLinks: data.socialLinks,
    }),
  );
  return toInstructorPrivateProfileDTO(updated)!;
}
