import { z } from "zod";

export const checkoutCourseSlugSchema = z.object({
  courseSlug: z.string().trim().min(1, "Course is required"),
});

export const orderIdSchema = z.object({
  orderId: z.string().trim().min(1, "Order is required"),
});

export const confirmTestPaymentSchema = orderIdSchema.extend({
  // Test-mode only — lets the checkout UI's "simulate a failed payment"
  // option exercise the failure path. Never anything resembling a real
  // card/bank field.
  simulateFailure: z.boolean().optional(),
});
