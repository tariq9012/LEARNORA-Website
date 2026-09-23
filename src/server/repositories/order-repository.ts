import { prisma } from "../db/client";
import type { Prisma } from "../../generated/prisma/client";

const ORDER_DETAIL_INCLUDE = {
  items: {
    include: {
      course: { select: { slug: true, title: true, instructor: { select: { name: true } } } },
    },
  },
  payments: { orderBy: { createdAt: "desc" } },
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
  items: { include: { course: { select: { title: true } } } },
  payments: { orderBy: { createdAt: "desc" }, take: 1 },
} as const;

export function listAllOrders(take = 100) {
  return prisma.order.findMany({
    include: ADMIN_ORDER_INCLUDE,
    orderBy: { createdAt: "desc" },
    take,
  });
}
