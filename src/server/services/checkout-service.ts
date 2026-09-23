import { randomUUID } from "node:crypto";

import { Prisma } from "../../generated/prisma/client";
import * as courseRepository from "../repositories/course-repository";
import * as enrollmentRepository from "../repositories/enrollment-repository";
import * as orderRepository from "../repositories/order-repository";
import { isEnrollmentEntitled } from "./enrollment-policy";
import { publicAssetUrl } from "../media/media-urls";
import type { SafeUser } from "../auth/types";
import type { CheckoutDTO, OrderSummaryDTO, AdminOrderDTO } from "../dto/checkout";

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
    };
  });
}

export { toOrderSummaryDTO };

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export async function getAdminOrders(): Promise<AdminOrderDTO[]> {
  const orders = await orderRepository.listAllOrders();
  return orders.map((order) => {
    const item = order.items[0];
    const latestPayment = order.payments[0];
    return {
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
    };
  });
}
