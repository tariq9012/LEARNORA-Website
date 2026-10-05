import { prisma } from "../db/client";
import type { Prisma } from "../../generated/prisma/client";

/** Persistence for Refund (Phase 10). Admin-only reads; provider references are never selected for listings. */

const REFUND_LIST_SELECT = {
  id: true,
  reference: true,
  amount: true,
  reason: true,
  status: true,
  createdAt: true,
  processedAt: true,
  payment: {
    select: {
      currency: true,
      order: {
        select: {
          orderNumber: true,
          user: { select: { name: true, email: true } },
          items: { select: { course: { select: { title: true } } }, take: 1 },
        },
      },
    },
  },
} as const;

export function listAll(take = 200) {
  return prisma.refund.findMany({
    select: REFUND_LIST_SELECT,
    orderBy: { createdAt: "desc" },
    take,
  });
}

export function findByIdForDto(refundId: string) {
  return prisma.refund.findUnique({ where: { id: refundId }, select: REFUND_LIST_SELECT });
}

export function aggregateProcessed() {
  return prisma.refund.aggregate({
    where: { status: "PROCESSED" },
    _sum: { amount: true },
    _count: { _all: true },
  });
}

export function createInTx(
  tx: Prisma.TransactionClient,
  data: {
    paymentId: string;
    reference: string;
    externalReference: string | null;
    amount: Prisma.Decimal;
    reason: string | null;
    adminId: string;
  },
) {
  const now = new Date();
  return tx.refund.create({
    data: {
      paymentId: data.paymentId,
      reference: data.reference,
      externalReference: data.externalReference,
      amount: data.amount,
      reason: data.reason,
      // Phase 10 refunds are issued directly by an admin, so the request and
      // the decision are the same person at the same moment.
      status: "PROCESSED",
      requestedById: data.adminId,
      processedById: data.adminId,
      processedAt: now,
    },
  });
}
