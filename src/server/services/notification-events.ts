import { notify } from "./notification-service";

/**
 * Business-event -> notification templates (Phase 11). This is the ONLY place
 * that decides what a notification says, who gets it, where it links and how
 * it is deduplicated. Every function is BEST-EFFORT (never throws) and is
 * called only AFTER the underlying business transaction has committed.
 *
 * Policies:
 *  - Payment SUCCESS notifies the student; payment FAILURE does not (the
 *    student is looking at the failure on screen, so a notification is noise).
 *  - A PAID enrollment is announced only by the payment notification (no
 *    second "you're enrolled" message); a FREE enrollment gets ENROLLMENT.
 *  - eventKey values are stable ids of the business record, never text:
 *      payment:<orderId>, refund:<refundId>, refund-reversal:<refundId>,
 *      payout-requested|paid|rejected:<payoutId>,
 *      course-review:<courseId>:<reviewedAt ms>, course-completed:<enrollmentId>,
 *      certificate:<certificateId>, message:<messageId>
 *  - Links are internal paths only (also validated inside notify()).
 *  - No payment credentials, provider references, or admin/internal notes
 *    ever go into a notification.
 */

export function notifyPaymentSucceeded(p: {
  studentId: string;
  orderId: string;
  orderNumber: string;
  courseTitle: string;
  amount: string;
  currency: string;
}) {
  return notify({
    userId: p.studentId,
    type: "PAYMENT",
    category: "payments",
    title: "Payment successful",
    message: `Your payment of ${p.currency} ${p.amount} for “${p.courseTitle}” went through (order ${p.orderNumber}). You now have access to the course.`,
    link: "/student/purchases",
    eventKey: `payment:${p.orderId}`,
  });
}

export function notifyFreeEnrollment(p: { studentId: string; courseTitle: string }) {
  return notify({
    userId: p.studentId,
    type: "ENROLLMENT",
    category: "courseUpdates",
    title: "You're enrolled",
    message: `You're now enrolled in “${p.courseTitle}”. Happy learning!`,
    link: "/student/learning",
    // No eventKey: an enrollment isn't retried (a second click is rejected as "already enrolled"),
    // and a re-enrollment after a refund is a genuinely new event.
    eventKey: null,
  });
}

export async function notifyRefundCompleted(p: {
  refundId: string;
  orderNumber: string;
  courseTitle: string;
  amount: string;
  currency: string;
  studentId: string;
  instructorId: string | null;
}) {
  await notify({
    userId: p.studentId,
    type: "REFUND",
    category: "refunds",
    title: "Refund completed",
    message: `Your order ${p.orderNumber} for “${p.courseTitle}” was refunded (${p.currency} ${p.amount}). Access to the course has ended.`,
    link: "/student/purchases",
    eventKey: `refund:${p.refundId}`,
  });
  if (p.instructorId) {
    await notify({
      userId: p.instructorId,
      type: "REFUND",
      category: "refunds",
      title: "A sale was refunded",
      message: `Order ${p.orderNumber} for “${p.courseTitle}” was refunded, so the related earning was reversed.`,
      link: "/instructor/earnings",
      eventKey: `refund-reversal:${p.refundId}`,
    });
  }
}

export function notifyPayoutRequested(p: {
  instructorId: string;
  payoutId: string;
  reference: string;
  amount: string;
  currency: string;
}) {
  return notify({
    userId: p.instructorId,
    type: "PAYOUT",
    category: "payouts",
    title: "Payout requested",
    message: `Your simulated payout ${p.reference} for ${p.currency} ${p.amount} is waiting for admin review.`,
    link: "/instructor/earnings",
    eventKey: `payout-requested:${p.payoutId}`,
  });
}

export function notifyPayoutPaid(p: {
  instructorId: string;
  payoutId: string;
  reference: string;
  amount: string;
  currency: string;
}) {
  return notify({
    userId: p.instructorId,
    type: "PAYOUT",
    category: "payouts",
    title: "Payout paid",
    message: `Your simulated payout ${p.reference} for ${p.currency} ${p.amount} was marked paid. No real funds were transferred.`,
    link: "/instructor/earnings",
    eventKey: `payout-paid:${p.payoutId}`,
  });
}

export function notifyPayoutRejected(p: {
  instructorId: string;
  payoutId: string;
  reference: string;
  amount: string;
  currency: string;
  /** The admin's optional, instructor-facing reason (Payout.rejectionReason) — never internal notes. */
  reason: string | null;
}) {
  const because = p.reason ? ` Reason: ${p.reason}` : "";
  return notify({
    userId: p.instructorId,
    type: "PAYOUT",
    category: "payouts",
    title: "Payout rejected",
    message: `Your payout ${p.reference} for ${p.currency} ${p.amount} was rejected and the earnings are available again.${because}`,
    link: "/instructor/earnings",
    eventKey: `payout-rejected:${p.payoutId}`,
  });
}

export function notifyCourseReviewed(p: {
  ownerId: string;
  courseId: string;
  courseTitle: string;
  approved: boolean;
  reviewedAtMs: number;
  /** The existing instructor-facing rejection reason (Course.rejectionReason). */
  reason: string | null;
}) {
  return notify({
    userId: p.ownerId,
    type: p.approved ? "COURSE_APPROVED" : "COURSE_REJECTED",
    category: "courseUpdates",
    title: p.approved ? "Course approved" : "Course needs changes",
    message: p.approved
      ? `“${p.courseTitle}” was approved and is now published.`
      : `“${p.courseTitle}” was not approved.${p.reason ? ` Reason: ${p.reason}` : ""}`,
    link: "/instructor/courses",
    // A course can be rejected, fixed, resubmitted and approved: each review is its own event.
    eventKey: `course-review:${p.courseId}:${p.reviewedAtMs}`,
  });
}

export function notifyCourseCompleted(p: {
  studentId: string;
  enrollmentId: string;
  courseTitle: string;
}) {
  return notify({
    userId: p.studentId,
    type: "COURSE_COMPLETED",
    category: "courseUpdates",
    title: "Course completed",
    message: `Congratulations! You completed “${p.courseTitle}”.`,
    link: "/student/certificates",
    // Once per enrollment, ever — reopening or re-completing doesn't notify again.
    eventKey: `course-completed:${p.enrollmentId}`,
  });
}

export function notifyCertificateReady(p: {
  studentId: string;
  certificateId: string;
  courseTitle: string;
}) {
  return notify({
    userId: p.studentId,
    type: "CERTIFICATE_READY",
    category: "certificates",
    title: "Your certificate is ready",
    message: `Your certificate for “${p.courseTitle}” is ready to view and share.`,
    link: `/student/certificates/${p.certificateId}`,
    eventKey: `certificate:${p.certificateId}`,
  });
}

export function notifyReportResolved(p: {
  reporterId: string;
  reportId: string;
  targetLabel: string;
}) {
  return notify({
    userId: p.reporterId,
    type: "SYSTEM",
    category: "moderation",
    title: "Your report was reviewed",
    message: `Thanks for the report about ${p.targetLabel}. Our team has reviewed it and taken action.`,
    link: null,
    eventKey: `report-resolved:${p.reportId}`,
  });
}

export function notifyReportDismissed(p: {
  reporterId: string;
  reportId: string;
  targetLabel: string;
}) {
  return notify({
    userId: p.reporterId,
    type: "SYSTEM",
    category: "moderation",
    title: "Your report was reviewed",
    message: `Thanks for the report about ${p.targetLabel}. Our team reviewed it and didn't find a violation.`,
    link: null,
    eventKey: `report-resolved:${p.reportId}`,
  });
}

export function notifyReviewHidden(p: { ownerId: string; reportId: string; courseTitle: string }) {
  return notify({
    userId: p.ownerId,
    type: "SYSTEM",
    category: "moderation",
    title: "Your review was hidden",
    message: `Your review on “${p.courseTitle}” was hidden after a moderation review.`,
    link: null,
    eventKey: `review-moderated:${p.reportId}`,
  });
}
