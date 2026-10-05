import { prisma } from "../db/client";
import type { Prisma } from "../../generated/prisma/client";

const ORDER_DETAIL_INCLUDE = {
  items: {
    include: {
      course: { select: { slug: true, title: true, instructor: { select: { name: true } } } },
    },
  },
  // `refund` (Phase 10) lets purchase history say "Refunded on …" without a second query.
  payments: {
    orderBy: { createdAt: "desc" },
    include: { refund: { select: { processedAt: true } } },
  },
} as const;

export function findOrderById(orderId: string) {
  return prisma.order.findUnique({ where: { id: orderId }, include: ORDER_DETAIL_INCLUDE });
}

/**
 * Stale-pending-order policy: reuse an existing PENDING order for the
 * same student + course rather than creating a new one on every
 * checkout-page visit. There is deliberately no expiry/cleanup job for
 * these in Phase 9 — a PENDING order is cheap, holds no funds, and
 * either gets paid or is simply abandoned; nothing depends on there
 * being at most one in the table over time, only at most one *active*
 * one being reused per student/course pair.
 */
export function findPendingOrderForCourse(userId: string, courseId: string) {
  return prisma.order.findFirst({
    where: { userId, status: "PENDING", items: { some: { courseId } } },
    include: ORDER_DETAIL_INCLUDE,
  });
}

export function createOrderWithItem(data: {
  userId: string;
  orderNumber: string;
  courseId: string;
  amount: Prisma.Decimal;
  currency: string;
}) {
  return prisma.order.create({
    data: {
      userId: data.userId,
      orderNumber: data.orderNumber,
      amount: data.amount,
      currency: data.currency,
      items: { create: { courseId: data.courseId, price: data.amount } },
    },
    include: ORDER_DETAIL_INCLUDE,
  });
}

/** Conditional — only actually marks FAILED if the order is still PENDING, so a stale/late failure can't clobber an order another request already resolved. */
export function markOrderFailedIfPending(orderId: string) {
  return prisma.order.updateMany({
    where: { id: orderId, status: "PENDING" },
    data: { status: "FAILED" },
  });
}

export function listOrdersForUser(userId: string) {
  return prisma.order.findMany({
    where: { userId },
    include: ORDER_DETAIL_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

const ADMIN_ORDER_INCLUDE = {
  user: { select: { name: true, email: true } },
  items: {
    include: {
      course: { select: { title: true } },
      // Phase 10: needed to tell the admin UI whether a refund is possible.
      earning: { select: { id: true, status: true, payoutId: true } },
    },
  },
  payments: {
    orderBy: { createdAt: "desc" },
    take: 1,
    include: { refund: { select: { id: true, reference: true, processedAt: true } } },
  },
} as const;

export type AdminOrderFilters = {
  search?: string;
  status?: "PENDING" | "PAID" | "FAILED" | "REFUNDED" | "PARTIALLY_REFUNDED";
  refund?: "refunded" | "not_refunded";
  sort?: "newest" | "oldest";
};

function adminOrderWhere(f: AdminOrderFilters): Prisma.OrderWhereInput {
  const refundedStatuses = ["REFUNDED", "PARTIALLY_REFUNDED"] as const;
  return {
    ...(f.status && { status: f.status }),
    ...(f.refund === "refunded" && { status: { in: [...refundedStatuses] } }),
    ...(f.refund === "not_refunded" && { status: { notIn: [...refundedStatuses] } }),
    ...(f.search && {
      OR: [
        { orderNumber: { contains: f.search, mode: "insensitive" as const } },
        { user: { name: { contains: f.search, mode: "insensitive" as const } } },
        { user: { email: { contains: f.search, mode: "insensitive" as const } } },
      ],
    }),
  };
}

/**
 * Phase 15: bounded, server-filtered page (replaces the old `take: 100`
 * list that was then filtered in the browser). One query with the
 * user/items/latest-payment includes — no per-row lookups.
 */
export function listOrdersForAdmin(filters: AdminOrderFilters, skip: number, take: number) {
  return prisma.order.findMany({
    where: adminOrderWhere(filters),
    include: ADMIN_ORDER_INCLUDE,
    orderBy: [{ createdAt: filters.sort === "oldest" ? "asc" : "desc" }, { id: "asc" }],
    skip,
    take,
  });
}

export function countOrdersForAdmin(filters: AdminOrderFilters) {
  return prisma.order.count({ where: adminOrderWhere(filters) });
}

/** Global (unfiltered) money summary in ONE grouped query, by persisted Order.amount and current status. */
export function orderTotalsByStatus() {
  return prisma.order.groupBy({
    by: ["status"],
    _sum: { amount: true },
    _count: { _all: true },
  });
}

/**
 * Everything the refund service needs to decide eligibility. Loads ALL of
 * the order's payments (not just the latest) so a corrupted order with two
 * successful payments is detected rather than silently refunding one.
 */
export function findOrderForRefund(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          earning: { select: { id: true, status: true, payoutId: true } },
        },
      },
      payments: {
        orderBy: { createdAt: "desc" },
        include: { refund: { select: { id: true } } },
      },
    },
  });
}
