import { prisma } from "../db/client";
import { ForbiddenError } from "../auth/guards";
import * as adminCourseRepository from "../repositories/admin-course-repository";
import * as paymentRepository from "../repositories/payment-repository";
import * as refundRepository from "../repositories/refund-repository";
import { Prisma } from "../../generated/prisma/client";
import type { SafeUser } from "../auth/types";
import type { AdminDashboardDTO, AdminRecentPaymentDTO } from "../dto/admin";

function assertAdmin(user: SafeUser) {
  if (user.role !== "ADMIN") throw new ForbiddenError("Only admins can do that.");
}

const REVENUE_CHART_MONTHS = 6;

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Real revenue by month, last 6 calendar months (UTC), oldest first.
 * Same bucketing approach as instructor earnings-by-month
 * (earnings-service.ts): pre-seed every month (so a month with zero
 * PAID payments shows a real zero, not a missing point) then sum the
 * PAID payments that actually happened in each one. Display-only.
 */
async function getMonthlyRevenue(): Promise<{ month: string; value: number }[]> {
  const now = new Date();
  const buckets: { key: string; label: string; total: Prisma.Decimal }[] = [];
  for (let i = REVENUE_CHART_MONTHS - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    buckets.push({
      key: monthKey(d),
      label: new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(d),
      total: new Prisma.Decimal(0),
    });
  }

  const since = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (REVENUE_CHART_MONTHS - 1), 1),
  );
  const rows = await paymentRepository.findPaidSince(since);
  for (const row of rows) {
    const bucket = buckets.find((b) => b.key === monthKey(row.createdAt));
    if (bucket) bucket.total = bucket.total.plus(row.amount);
  }

  return buckets.map((b) => ({ month: b.label, value: Number(b.total.toFixed(2)) }));
}

export async function getAdminDashboard(admin: SafeUser): Promise<AdminDashboardDTO> {
  assertAdmin(admin);

  const [
    totalUsers,
    activeStudents,
    instructors,
    pendingInstructorApprovals,
    courseStatusGroups,
    activeEnrollments,
    completedEnrollments,
    paidAgg,
    refundAgg,
    revenueByMonth,
    pendingCourses,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: "STUDENT", status: "ACTIVE" } }),
    prisma.user.count({ where: { role: "INSTRUCTOR" } }),
    prisma.instructorProfile.count({ where: { approvalStatus: "PENDING" } }),
    adminCourseRepository.countCoursesByStatus(),
    prisma.enrollment.count({ where: { status: "ACTIVE" } }),
    prisma.enrollment.count({ where: { status: "COMPLETED" } }),
    paymentRepository.aggregatePaid(),
    refundRepository.aggregateProcessed(),
    getMonthlyRevenue(),
    adminCourseRepository.findPendingCourses(),
  ]);

  const byStatus: Record<string, number> = {};
  for (const group of courseStatusGroups) byStatus[group.status] = group._count._all;
  const totalCourses = Object.values(byStatus).reduce((sum, n) => sum + n, 0);

  return {
    totalUsers,
    activeStudents,
    instructors,
    pendingInstructorApprovals,
    totalCourses,
    publishedCourses: byStatus["PUBLISHED"] ?? 0,
    pendingCourseReviews: byStatus["PENDING_REVIEW"] ?? 0,
    activeEnrollments,
    completedEnrollments,
    paidPayments: paidAgg._count._all,
    processedRefunds: refundAgg._count._all,
    refundedAmount: Number((refundAgg._sum.amount ?? new Prisma.Decimal(0)).toFixed(2)),
    platformRevenue: Number((paidAgg._sum.amount ?? new Prisma.Decimal(0)).toFixed(2)),
    currency: "USD",
    revenueByMonth,
    pendingCourses: pendingCourses
      .slice(0, 5)
      .map((c) => ({ id: c.id, title: c.title, instructorName: c.instructor.name })),
  };
}

export async function getRecentPayments(admin: SafeUser): Promise<AdminRecentPaymentDTO[]> {
  assertAdmin(admin);
  const rows = await paymentRepository.findRecentForAdmin(8);
  return rows.map((p) => ({
    id: p.id,
    orderNumber: p.order.orderNumber,
    studentName: p.order.user.name,
    courseTitle: p.order.items[0]?.course.title ?? "—",
    amount: Number(p.amount),
    currency: p.currency,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
  }));
}
