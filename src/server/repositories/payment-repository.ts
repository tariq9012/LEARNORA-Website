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
