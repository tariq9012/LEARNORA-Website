import { ForbiddenError } from "../auth/guards";
import * as earningRepository from "../repositories/instructor-earning-repository";
import * as instructorRepository from "../repositories/instructor-repository";
import { Prisma } from "../../generated/prisma/client";
import type { SafeUser } from "../auth/types";
import type { InstructorAnalyticsDTO } from "../dto/admin";

const CHART_MONTHS = 6;

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function emptyBuckets() {
  const now = new Date();
  const buckets: { key: string; label: string; total: Prisma.Decimal }[] = [];
  for (let i = CHART_MONTHS - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    buckets.push({
      key: monthKey(d),
      label: new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(d),
      total: new Prisma.Decimal(0),
    });
  }
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (CHART_MONTHS - 1), 1));
  return { buckets, since };
}

const money = (d: Prisma.Decimal) => Number(d.toFixed(2));

/**
 * Everything on /instructor/analytics. The instructor is ALWAYS the
 * authenticated session user; there is no instructorId parameter, so one
 * instructor can't request another's numbers.
 *
 * Money definitions (Phase 10 rules, from persisted InstructorEarning rows —
 * never current course prices):
 *  - totalEarnings     = netAmount of every earning that is not REVERSED
 *                        (a refunded sale's earning is REVERSED and excluded)
 *  - availableEarnings = status AVAILABLE
 *  - paidEarnings      = status PAID
 * These are the instructor's NET share, not gross sales and not platform revenue.
 */
export async function getInstructorAnalytics(
  instructor: SafeUser,
): Promise<InstructorAnalyticsDTO> {
  if (instructor.role !== "INSTRUCTOR") throw new ForbiddenError("Only instructors can do that.");
  const instructorId = instructor.id;

  const earningsWindow = emptyBuckets();
  const enrollmentWindow = emptyBuckets();

  const [
    courses,
    enrollmentGroups,
    earnings,
    reviewStats,
    distribution,
    enrollmentDates,
    monthlyEarnings,
  ] = await Promise.all([
    instructorRepository.coursesForAnalytics(instructorId),
    instructorRepository.enrollmentCountsByCourseStatus(instructorId),
    earningRepository.listNonReversedWithCourse(instructorId),
    instructorRepository.visibleReviewStatsByCourse(instructorId),
    instructorRepository.visibleRatingDistribution(instructorId),
    instructorRepository.entitledEnrollmentDatesSince(instructorId, enrollmentWindow.since),
    earningRepository.listNonReversedSince(instructorId, earningsWindow.since),
  ]);

  for (const row of monthlyEarnings) {
    const bucket = earningsWindow.buckets.find((b) => b.key === monthKey(row.createdAt));
    if (bucket) bucket.total = bucket.total.plus(row.netAmount);
  }
  for (const row of enrollmentDates) {
    const bucket = enrollmentWindow.buckets.find((b) => b.key === monthKey(row.enrolledAt));
    if (bucket) bucket.total = bucket.total.plus(1);
  }

  // Earnings totals + per-course.
  let total = new Prisma.Decimal(0);
  let available = new Prisma.Decimal(0);
  let paid = new Prisma.Decimal(0);
  const earningsByCourse = new Map<string, Prisma.Decimal>();
  for (const e of earnings) {
    total = total.plus(e.netAmount);
    if (e.status === "AVAILABLE") available = available.plus(e.netAmount);
    if (e.status === "PAID") paid = paid.plus(e.netAmount);
    const courseId = e.orderItem.courseId;
    earningsByCourse.set(
      courseId,
      (earningsByCourse.get(courseId) ?? new Prisma.Decimal(0)).plus(e.netAmount),
    );
  }

  // Enrollment counts per course. "Students" = entitled (ACTIVE + COMPLETED).
  const entitledByCourse = new Map<string, number>();
  const completedByCourse = new Map<string, number>();
  for (const g of enrollmentGroups) {
    if (g.status === "ACTIVE" || g.status === "COMPLETED") {
      entitledByCourse.set(g.courseId, (entitledByCourse.get(g.courseId) ?? 0) + g._count._all);
    }
    if (g.status === "COMPLETED") completedByCourse.set(g.courseId, g._count._all);
  }

  const statsByCourse = new Map(reviewStats.map((r) => [r.courseId, r]));
  let ratingSum = 0;
  let ratingCount = 0;
  for (const r of reviewStats) {
    if (r._avg.rating != null) {
      ratingSum += r._avg.rating * r._count._all;
      ratingCount += r._count._all;
    }
  }

  const distributionByRating = new Map(distribution.map((d) => [d.rating, d._count._all]));

  return {
    totalCourses: courses.length,
    publishedCourses: courses.filter((c) => c.status === "PUBLISHED").length,
    totalStudents: [...entitledByCourse.values()].reduce((a, b) => a + b, 0),
    completions: [...completedByCourse.values()].reduce((a, b) => a + b, 0),
    averageRating: ratingCount > 0 ? Number((ratingSum / ratingCount).toFixed(1)) : null,
    reviewCount: ratingCount,
    totalEarnings: money(total),
    availableEarnings: money(available),
    paidEarnings: money(paid),
    currency: "USD",
    earningsByMonth: earningsWindow.buckets.map((b) => ({ month: b.label, value: money(b.total) })),
    enrollmentsByMonth: enrollmentWindow.buckets.map((b) => ({
      month: b.label,
      value: Number(b.total),
    })),
    ratingDistribution: [5, 4, 3, 2, 1].map((rating) => ({
      rating,
      count: distributionByRating.get(rating) ?? 0,
    })),
    courses: courses.map((c) => {
      const s = statsByCourse.get(c.id);
      return {
        courseId: c.id,
        title: c.title,
        status: c.status,
        enrollments: entitledByCourse.get(c.id) ?? 0,
        completions: completedByCourse.get(c.id) ?? 0,
        averageRating: s?._avg.rating != null ? Number(s._avg.rating.toFixed(1)) : null,
        reviewCount: s?._count._all ?? 0,
        earnings: money(earningsByCourse.get(c.id) ?? new Prisma.Decimal(0)),
      };
    }),
  };
}
