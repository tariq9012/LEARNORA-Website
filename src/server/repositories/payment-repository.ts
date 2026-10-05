import { prisma } from "../db/client";
import type { Prisma } from "../../generated/prisma/client";

export function createPayment(data: {
  orderId: string;
  amount: Prisma.Decimal;
  currency: string;
  status: "PAID" | "FAILED";
  provider: string;
  externalReference: string;
}) {
  return prisma.payment.create({ data });
}

/** Same as createPayment, but runs inside a caller-supplied transaction — used only by the atomic payment-success path in payment-service.ts. */
export function createPaymentInTx(
  tx: Prisma.TransactionClient,
  data: {
    orderId: string;
    amount: Prisma.Decimal;
    currency: string;
    status: "PAID";
    provider: string;
    externalReference: string;
  },
) {
  return tx.payment.create({ data });
}

const ADMIN_RECENT_SELECT = {
  id: true,
  amount: true,
  currency: true,
  status: true,
  createdAt: true,
  order: {
    select: {
      orderNumber: true,
      user: { select: { name: true } },
      items: { select: { course: { select: { title: true } } }, take: 1 },
    },
  },
} as const;

/** Bounded "latest transactions" source for the admin dashboard — never the whole table, unlike the full /admin/payments listing. */
export function findRecentForAdmin(take = 8) {
  return prisma.payment.findMany({
    select: ADMIN_RECENT_SELECT,
    orderBy: { createdAt: "desc" },
    take,
  });
}

/** Real platform revenue = successful (PAID) payments only. A refund flips Payment.status away from PAID (see refund-service.ts), so this sum never needs a separate refund subtraction — it's always current. Phase 10 only issues full refunds, so PARTIALLY_REFUNDED is unused today; revisit this formula if that changes. */
export function aggregatePaid() {
  return prisma.payment.aggregate({
    where: { status: "PAID" },
    _sum: { amount: true },
    _count: { _all: true },
  });
}

/** Real revenue source for the dashboard's monthly chart — PAID payments only, bounded to `since`. */
export function findPaidSince(since: Date) {
  return prisma.payment.findMany({
    where: { status: "PAID", createdAt: { gte: since } },
    select: { amount: true, createdAt: true },
  });
}
