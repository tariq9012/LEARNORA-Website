import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { ForbiddenError, UnauthorizedError, requireAdmin, requireStudent } from "../auth/guards";
import {
  CheckoutError,
  createCheckoutOrder,
  getAdminOrders,
  getCheckout,
  getMyOrder,
  getMyPurchases,
} from "../services/checkout-service";
import { PaymentError, confirmTestPayment } from "../services/payment-service";
import type {
  AdminOrderListDTO,
  CheckoutDTO,
  OrderSummaryDTO,
  PurchaseHistoryItemDTO,
} from "../dto/checkout";
import {
  checkoutCourseSlugSchema,
  confirmTestPaymentSchema,
  orderIdSchema,
} from "../validation/checkout";

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

function toActionError(error: unknown): { success: false; error: string } {
  if (error instanceof z.ZodError) {
    return { success: false, error: error.issues[0]?.message ?? "Invalid input." };
  }
  if (error instanceof UnauthorizedError) {
    return { success: false, error: "Please log in to continue." };
  }
  if (error instanceof ForbiddenError) {
    return { success: false, error: "Only student accounts can do that." };
  }
  if (error instanceof CheckoutError || error instanceof PaymentError) {
    return { success: false, error: error.message };
  }
  console.error("[checkout] unexpected error", error);
  return { success: false, error: "Something went wrong. Please try again." };
}

/** Read-only checkout preview — safe to reload, creates nothing. */
export const getCheckoutFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => checkoutCourseSlugSchema.parse(data))
  .handler(async ({ data }): Promise<ActionResult<CheckoutDTO>> => {
    try {
      const user = await requireStudent();
      const checkout = await getCheckout(user, data.courseSlug);
      return { success: true, data: checkout };
    } catch (error) {
      return toActionError(error);
    }
  });

/** Creates (or reuses) the PENDING order — called when the student clicks "Complete Purchase." */
export const createCheckoutOrderFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => checkoutCourseSlugSchema.parse(data))
  .handler(async ({ data }): Promise<ActionResult<OrderSummaryDTO>> => {
    try {
      const user = await requireStudent();
      const order = await createCheckoutOrder(user, data.courseSlug);
      return { success: true, data: order };
    } catch (error) {
      return toActionError(error);
    }
  });

/** Test-mode payment confirmation — idempotent, see payment-service.ts. */
export const confirmTestPaymentFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => confirmTestPaymentSchema.parse(data))
  .handler(async ({ data }): Promise<ActionResult<OrderSummaryDTO>> => {
    try {
      const user = await requireStudent();
      const order = await confirmTestPayment(user, data.orderId, {
        simulateFailure: data.simulateFailure,
      });
      return { success: true, data: order };
    } catch (error) {
      return toActionError(error);
    }
  });

/** Owner-only — returns null (not an error) for "not found"/"not yours" alike, so the success/detail route can show a normal 404. */
export const getMyOrderFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => orderIdSchema.parse(data))
  .handler(async ({ data }): Promise<OrderSummaryDTO | null> => {
    const user = await requireStudent();
    return getMyOrder(user, data.orderId);
  });

export const getMyPurchasesFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<PurchaseHistoryItemDTO[]> => {
    const user = await requireStudent();
    return getMyPurchases(user);
  },
);

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export const getAdminOrdersFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => data ?? {})
  .handler(async ({ data }): Promise<AdminOrderListDTO> => {
    const admin = await requireAdmin();
    return getAdminOrders(admin, data);
  });
