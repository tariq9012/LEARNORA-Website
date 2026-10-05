import { prisma } from "../db/client";
import type { Prisma } from "../../generated/prisma/client";

/**
 * Phase 15 admin user/student listing queries. Every select is an explicit
 * allow-list — passwordHash and every relation that could carry secrets
 * (sessions, reset tokens, messages, orders) is never selected.
 */

export type AdminUserFilters = {
  search?: string;
  role?: "STUDENT" | "INSTRUCTOR" | "ADMIN";
  status?: "ACTIVE" | "SUSPENDED" | "BANNED";
  sort?: "newest" | "oldest";
};

const USER_LIST_SELECT = {
  id: true,
  name: true,
  email: true,
  avatar: true,
  avatarAssetId: true,
  role: true,
  status: true,
  emailVerified: true,
  createdAt: true,
  instructorProfile: { select: { approvalStatus: true } },
  studentProfile: { select: { headline: true } },
} as const;

function buildWhere(filters: AdminUserFilters): Prisma.UserWhereInput {
  return {
    ...(filters.role && { role: filters.role }),
    ...(filters.status && { status: filters.status }),
    ...(filters.search && {
      OR: [
        { name: { contains: filters.search, mode: "insensitive" as const } },
        { email: { contains: filters.search, mode: "insensitive" as const } },
      ],
    }),
  };
}

export function listUsersForAdmin(filters: AdminUserFilters, skip: number, take: number) {
  return prisma.user.findMany({
    where: buildWhere(filters),
    select: USER_LIST_SELECT,
    // id as a tiebreaker keeps pagination stable for identical timestamps.
    orderBy: [{ createdAt: filters.sort === "oldest" ? "asc" : "desc" }, { id: "asc" }],
    skip,
    take,
  });
}

export function countUsersForAdmin(filters: AdminUserFilters) {
  return prisma.user.count({ where: buildWhere(filters) });
}

// -- per-page aggregates (each is ONE grouped query for the whole page) -------

export function enrollmentCountsByUser(userIds: string[]) {
  return prisma.enrollment.groupBy({
    by: ["userId", "status"],
    where: { userId: { in: userIds } },
    _count: { _all: true },
  });
}

export function certificateCountsByUser(userIds: string[]) {
  return prisma.certificate.groupBy({
    by: ["userId"],
    where: { userId: { in: userIds } },
    _count: { _all: true },
  });
}

/** Net spend source: persisted amounts of orders that are currently PAID (refunded orders are REFUNDED and excluded). */
export function paidOrderTotalsByUser(userIds: string[]) {
  return prisma.order.groupBy({
    by: ["userId"],
    where: { userId: { in: userIds }, status: "PAID" },
    _sum: { amount: true },
  });
}

// -- account status -------------------------------------------------------------

export function findUserForStatusChange(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, status: true },
  });
}

/**
 * Race-safe status change: the WHERE re-asserts "not an admin" and "status
 * actually differs", so a concurrent role/status change can't slip past the
 * service-level checks. Non-ACTIVE statuses also revoke every session in the
 * same transaction. Returns the number of rows changed (0 or 1).
 */
export async function changeUserStatus(
  userId: string,
  status: "ACTIVE" | "SUSPENDED" | "BANNED",
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const result = await tx.user.updateMany({
      where: { id: userId, role: { not: "ADMIN" }, status: { not: status } },
      data: { status },
    });
    if (result.count === 1 && status !== "ACTIVE") {
      await tx.session.deleteMany({ where: { userId } });
    }
    return result.count;
  });
}
