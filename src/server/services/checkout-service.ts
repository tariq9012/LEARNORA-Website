import { randomUUID } from "node:crypto";

import { Prisma } from "../../generated/prisma/client";
import * as courseRepository from "../repositories/course-repository";
import * as enrollmentRepository from "../repositories/enrollment-repository";
import * as orderRepository from "../repositories/order-repository";
import { isEnrollmentEntitled } from "./enrollment-policy";
import { evaluateRefundEligibility, REFUND_MESSAGES } from "./refund-policy";
import { publicAssetUrl } from "../media/media-urls";
import type { SafeUser } from "../auth/types";
import { ForbiddenError } from "../auth/guards";
import { resolvePagination } from "../validation/pagination";
import { listAdminPaymentsSchema } from "../validation/admin";
import type {
  CheckoutDTO,
  OrderSummaryDTO,
  AdminOrderDTO,
  AdminOrderListDTO,
  AdminPaymentSummaryDTO,
} from "../dto/checkout";
import { enforceRateLimit } from "../auth/rate-limit";
import type { BillingSummaryDTO } from "../dto/account";

export class CheckoutError extends Error {}
export class CourseNotAvailableForPurchaseError extends CheckoutError {
  constructor(message = "This course isn't available for purchase.") {
    super(message);
  }
}
export class CourseIsFreeError extends CheckoutError {
  constructor() {
    super("This course is free — enroll directly instead of checking out.");
  }
}
export class AlreadyEntitledError extends CheckoutError {
  constructor() {
    super("You already have access to this course.");
  }
}
export class OrderNotFoundError extends CheckoutError {
  constructor() {
    super("Order not found.");
  }
}

/**
 * `LRN-ORD-<10 hex chars>` — same shape/entropy reasoning as Phase 8's
 * certificate codes (crypto.randomUUID, not a counter): this is the
 * only reference shown to the student or used in a URL, never the
 * internal cuid.
 */
function generateOrderNumber(): string {
  const random = randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
  return `LRN-ORD-${random}`;
}

async function loadPurchasableCourse(courseSlug: string) {
  const course = await courseRepository.findCourseBySlugForLearning(courseSlug);
  if (!course || course.status !== "PUBLISHED") throw new CourseNotAvailableForPurchaseError();
  return course;
}

async function assertNotAlreadyEntitled(userId: string, courseId: string) {
  const enrollment = await enrollmentRepository.findEnrollment(userId, courseId);
  if (enrollment && isEnrollmentEntitled(enrollment.status)) throw new AlreadyEntitledError();
}

function thumbnailUrlOf(course: { thumbnailAssetId: string | null; thumbnail: string | null }) {
  return course.thumbnailAssetId ? publicAssetUrl(course.thumbnailAssetId) : course.thumbnail;
}

function authoritativeAmount(course: {
  price: Prisma.Decimal;
  discountPrice: Prisma.Decimal | null;
}) {
  return course.discountPrice ?? course.price;
}

/**
 * Read-only checkout preview — safe to reload, never creates anything.
 * The price shown here, and the price an order is later created with,
 * both come from this same DB read; nothing from the client is ever
 * trusted for the amount.
 */
export async function getCheckout(user: SafeUser, courseSlug: string): Promise<CheckoutDTO> {
  const course = await loadPurchasableCourse(courseSlug);
  if (Number(course.price) === 0) throw new CourseIsFreeError();
  await assertNotAlreadyEntitled(user.id, course.id);

  const amount = authoritativeAmount(course);
  const hasDiscount =
    course.discountPrice != null && Number(course.discountPrice) < Number(course.price);

  return {
    courseSlug: course.slug,
    courseTitle: course.title,
    thumbnailUrl: thumbnailUrlOf(course),
    instructorName: course.instructor.name,
    amount: Number(amount),
    originalAmount: hasDiscount ? Number(course.price) : null,
    currency: "USD",
  };
}

function toOrderSummaryDTO(
  order: NonNullable<Awaited<ReturnType<typeof orderRepository.findOrderById>>>,
): OrderSummaryDTO {
  const item = order.items[0];
  const latestPayment = order.payments[0];
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    amount: Number(order.amount),
    currency: order.currency,
    status: order.status,
    courseSlug: item?.course.slug ?? "",
    courseTitle: item?.course.title ?? "",
    instructorName: item?.course.instructor.name ?? "",
    createdAt: order.createdAt.toISOString(),
    paymentStatus: latestPayment?.status ?? null,
  };
}

/**
 * Creates a PENDING order for the course, or returns an existing PENDING
 * order for the same student/course if one is already open — see the
 * stale-pending-order note on findPendingOrderForCourse. Re-derives
 * eligibility and price fresh every time; a stale client can't reuse an
 * old amount by holding onto an old page.
 */
export async function createCheckoutOrder(
  user: SafeUser,
  courseSlug: string,
): Promise<OrderSummaryDTO> {
  await enforceRateLimit(`checkout:${user.id}`, 30, 10 * 60 * 1000);
  const course = await loadPurchasableCourse(courseSlug);
  if (Number(course.price) === 0) throw new CourseIsFreeError();
  await assertNotAlreadyEntitled(user.id, course.id);

  const existing = await orderRepository.findPendingOrderForCourse(user.id, course.id);
  if (existing) return toOrderSummaryDTO(existing);

  const order = await orderRepository.createOrderWithItem({
    userId: user.id,
    orderNumber: generateOrderNumber(),
    courseId: course.id,
    amount: authoritativeAmount(course),
    currency: "USD",
  });
  return toOrderSummaryDTO(order);
}

/** Owner-only fetch — used by the success page and order-detail views. Never distinguishes "doesn't exist" from "not yours." */
export async function getMyOrder(user: SafeUser, orderId: string): Promise<OrderSummaryDTO | null> {
  const order = await orderRepository.findOrderById(orderId);
  if (!order || order.userId !== user.id) return null;
  return toOrderSummaryDTO(order);
}

export async function getMyPurchases(user: SafeUser) {
  const orders = await orderRepository.listOrdersForUser(user.id);
  return orders.map((order) => {
    const item = order.items[0];
    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      courseSlug: item?.course.slug ?? "",
      courseTitle: item?.course.title ?? "",
      amount: Number(order.amount),
      currency: order.currency,
      status: order.status,
      createdAt: order.createdAt.toISOString(),
      // A refunded order's payment carries the refund; null for everything else.
      refundedAt: order.payments.find((p) => p.refund)?.refund?.processedAt?.toISOString() ?? null,
    };
  });
}

/**
 * Compact billing view for Settings → Billing (Phase 13 spec item 18/19).
 * Built entirely from getMyPurchases() — no second billing ledger, no
 * business logic duplicated from /student/purchases.
 */
export async function getBillingSummary(user: SafeUser): Promise<BillingSummaryDTO> {
  const purchases = await getMyPurchases(user);
  const counted = purchases.filter((p) => p.status === "PAID" || p.status === "PARTIALLY_REFUNDED");
  const totalSpent = counted.reduce((sum, p) => sum + p.amount, 0);

  return {
    totalOrders: purchases.length,
    totalSpent,
    currency: purchases[0]?.currency ?? "USD",
    recent: purchases.slice(0, 5),
  };
}

export { toOrderSummaryDTO };

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export async function getAdminOrders(
  admin: SafeUser,
  input: unknown = {},
): Promise<AdminOrderListDTO> {
  if (admin.role !== "ADMIN") throw new ForbiddenError("Only admins can do that.");
  const parsed = listAdminPaymentsSchema.parse(input ?? {});
  const { page, pageSize, skip, take } = resolvePagination(parsed);
  const filters: orderRepository.AdminOrderFilters = {
    ...(parsed.search && { search: parsed.search }),
    ...(parsed.status && { status: parsed.status }),
    ...(parsed.refund && { refund: parsed.refund }),
    ...(parsed.sort && { sort: parsed.sort }),
  };

  // Three queries total regardless of page size: page rows (with user, item,
  // latest payment + refund joined), filtered count, unfiltered summary.
  const [orders, total, totals] = await Promise.all([
    orderRepository.listOrdersForAdmin(filters, skip, take),
    orderRepository.countOrdersForAdmin(filters),
    orderRepository.orderTotalsByStatus(),
  ]);

  const mapped: AdminOrderDTO[] = orders.map((order) => {
    const item = order.items[0];
    const latestPayment = order.payments[0];

    // Same pure rules the refund service uses, so the button state can never
    // disagree with what the server will actually allow. Only PAID orders get
    // a "blocked" explanation; an already-refunded/pending/failed order just
    // has no Refund action.
    const eligibility = evaluateRefundEligibility(order);
    const refundBlockedReason =
      !eligibility.ok && order.status === "PAID" ? REFUND_MESSAGES[eligibility.code] : null;
    const refundRow = latestPayment?.refund ?? null;

    return {
      id: order.id,
      orderId: order.id,
      orderNumber: order.orderNumber,
      studentName: order.user.name,
      studentEmail: order.user.email,
      courseTitle: item?.course.title ?? "",
      amount: Number(order.amount),
      currency: order.currency,
      status: order.status,
      paymentStatus: latestPayment?.status ?? null,
      paymentProvider: latestPayment?.provider ?? null,
      createdAt: order.createdAt.toISOString(),
      refundable: eligibility.ok,
      refundBlockedReason,
      refund: refundRow
        ? {
            reference: refundRow.reference,
            processedAt: refundRow.processedAt?.toISOString() ?? null,
          }
        : null,
    };
  });

  return { orders: mapped, total, page, pageSize, summary: summarizeOrderTotals(totals) };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Pure so it can be unit-checked: see AdminPaymentSummaryDTO for the exact definitions. */
export function summarizeOrderTotals(
  totals: {
    status: string;
    _sum: { amount: { toString(): string } | null };
    _count: { _all: number };
  }[],
): AdminPaymentSummaryDTO {
  const sum = (...statuses: string[]) =>
    totals
      .filter((t) => statuses.includes(t.status))
      .reduce((n, t) => n + Number(t._sum.amount?.toString() ?? 0), 0);
  const count = (...statuses: string[]) =>
    totals.filter((t) => statuses.includes(t.status)).reduce((n, t) => n + t._count._all, 0);

  const refundedVolume = sum("REFUNDED", "PARTIALLY_REFUNDED");
  const grossCollected = sum("PAID") + refundedVolume;
  return {
    grossCollected: round2(grossCollected),
    refundedVolume: round2(refundedVolume),
    netCollected: round2(grossCollected - refundedVolume),
    paidCount: count("PAID"),
    refundedCount: count("REFUNDED", "PARTIALLY_REFUNDED"),
    failedCount: count("FAILED"),
    pendingCount: count("PENDING"),
    currency: "USD",
  };
}
