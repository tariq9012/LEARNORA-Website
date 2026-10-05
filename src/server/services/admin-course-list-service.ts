import { ForbiddenError } from "../auth/guards";
import * as adminCourseRepository from "../repositories/admin-course-repository";
import { resolvePagination } from "../validation/pagination";
import { listAdminCoursesSchema } from "../validation/admin";
import type { SafeUser } from "../auth/types";
import type { AdminCourseListDTO } from "../dto/admin";

function assertAdmin(user: SafeUser) {
  if (user.role !== "ADMIN") throw new ForbiddenError("Only admins can do that.");
}

/**
 * Read-only listing. Moderation of PENDING_REVIEW courses stays entirely
 * in admin-course-review-service.ts (Phase 6) — this page links there
 * rather than duplicating approve/reject.
 */
export async function listAdminCourses(
  admin: SafeUser,
  input: unknown,
): Promise<AdminCourseListDTO> {
  assertAdmin(admin);
  const filters = listAdminCoursesSchema.parse(input ?? {});
  const { page, pageSize, skip, take } = resolvePagination(filters);

  const where = {
    ...(filters.status && { status: filters.status }),
    ...(filters.categoryId && { categoryId: filters.categoryId }),
    ...(filters.instructorId && { instructorId: filters.instructorId }),
    ...(filters.search && { search: filters.search }),
  };

  const [rows, total] = await Promise.all([
    adminCourseRepository.listCoursesForAdmin(where, skip, take),
    adminCourseRepository.countCoursesForAdmin(where),
  ]);

  const stats = await adminCourseRepository.visibleRatingStatsForCourses(rows.map((r) => r.id));
  const statsByCourse = new Map(stats.map((s) => [s.courseId, s]));

  return {
    total,
    page,
    pageSize,
    courses: rows.map((c) => {
      const s = statsByCourse.get(c.id);
      return {
        id: c.id,
        title: c.title,
        slug: c.slug,
        status: c.status,
        price: Number(c.price),
        currency: "USD",
        categoryName: c.category?.name ?? null,
        instructorId: c.instructor.id,
        instructorName: c.instructor.name,
        enrollmentCount: c._count.enrollments,
        averageRating: s?._avg.rating != null ? Number(s._avg.rating.toFixed(1)) : null,
        reviewCount: s?._count._all ?? 0,
        createdAt: c.createdAt.toISOString(),
        publishedAt: c.publishedAt?.toISOString() ?? null,
      };
    }),
  };
}
