import { ForbiddenError } from "../auth/guards";
import * as adminCourseRepository from "../repositories/admin-course-repository";
import * as instructorRepository from "../repositories/instructor-repository";
import { publicAssetUrl } from "../media/media-urls";
import { resolvePagination } from "../validation/pagination";
import { decideInstructorSchema, listAdminInstructorsSchema } from "../validation/admin";
import type { SafeUser } from "../auth/types";
import type { AdminInstructorDTO, AdminInstructorListDTO } from "../dto/admin";

export class InstructorAdminError extends Error {}

function assertAdmin(user: SafeUser) {
  if (user.role !== "ADMIN") throw new ForbiddenError("Only admins can do that.");
}

export async function listAdminInstructors(
  admin: SafeUser,
  input: unknown,
): Promise<AdminInstructorListDTO> {
  assertAdmin(admin);
  const filters = listAdminInstructorsSchema.parse(input ?? {});
  const { page, pageSize, skip, take } = resolvePagination(filters);
  const where = {
    ...(filters.approvalStatus && { approvalStatus: filters.approvalStatus }),
    ...(filters.search && { search: filters.search }),
  };

  const [users, total] = await Promise.all([
    instructorRepository.listInstructorsForAdmin(where, skip, take),
    instructorRepository.countInstructorsForAdmin(where),
  ]);

  // Two grouped queries for the whole page — courses/students, then
  // visible-review ratings — instead of one query per instructor row.
  const courses = users.length
    ? await instructorRepository.coursesWithStudentCountsForInstructors(users.map((u) => u.id))
    : [];
  const ratingStats = courses.length
    ? await adminCourseRepository.visibleRatingStatsForCourses(courses.map((c) => c.id))
    : [];
  const ratingByCourse = new Map(ratingStats.map((r) => [r.courseId, r]));

  const instructors: AdminInstructorDTO[] = users.map((u) => {
    const own = courses.filter((c) => c.instructorId === u.id);
    let ratingSum = 0;
    let ratingCount = 0;
    for (const c of own) {
      const r = ratingByCourse.get(c.id);
      if (r && r._avg.rating != null) {
        ratingSum += r._avg.rating * r._count._all;
        ratingCount += r._count._all;
      }
    }
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      avatarUrl: u.avatarAssetId ? publicAssetUrl(u.avatarAssetId) : u.avatar,
      approvalStatus: u.instructorProfile?.approvalStatus ?? "PENDING",
      rejectionReason: u.instructorProfile?.rejectionReason ?? null,
      joinedAt: u.createdAt.toISOString(),
      courseCount: own.length,
      publishedCourseCount: own.filter((c) => c.status === "PUBLISHED").length,
      studentCount: own.reduce((sum, c) => sum + c._count.enrollments, 0),
      averageRating: ratingCount > 0 ? Number((ratingSum / ratingCount).toFixed(1)) : null,
    };
  });

  return { instructors, total, page, pageSize };
}

/**
 * Allowed transitions: PENDING → APPROVED, PENDING → REJECTED,
 * REJECTED → APPROVED (a second look). APPROVED → REJECTED is
 * deliberately not allowed here: revoking an instructor who may already
 * have published courses and earnings is a bigger decision than this
 * workflow covers. The status comes from the validated decision enum,
 * never a client-supplied status string, and only admins reach this.
 * Effects are immediate because every instructor guard reads
 * approvalStatus from the DB per request (Phase 6).
 */
export async function decideInstructor(admin: SafeUser, input: unknown): Promise<void> {
  assertAdmin(admin);
  const data = decideInstructorSchema.parse(input);

  const profile = await instructorRepository.findInstructorProfileForDecision(data.instructorId);
  if (!profile) throw new InstructorAdminError("Instructor not found.");

  if (data.decision === "APPROVE") {
    if (profile.approvalStatus === "APPROVED") {
      throw new InstructorAdminError("This instructor is already approved.");
    }
    await instructorRepository.approveInstructorProfile(profile.userId, admin.id);
    return;
  }

  if (profile.approvalStatus !== "PENDING") {
    throw new InstructorAdminError("Only pending instructors can be rejected.");
  }
  await instructorRepository.rejectInstructorProfile(profile.userId, admin.id, data.reason!.trim());
}
