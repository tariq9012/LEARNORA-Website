/**
 * The single source of truth for "does this enrollment currently grant
 * access to the course". Every place that decides whether a student can
 * see a lesson, stream a video, download a resource, or write progress
 * must go through this — never inline a status check or treat "an
 * enrollment row exists" as sufficient on its own.
 *
 * ACTIVE and COMPLETED both grant access (a student who finished a
 * course should still be able to rewatch it). CANCELLED never does,
 * regardless of how the cancellation happened (refund, admin action,
 * etc.) — the enrollment row is kept for history, not as a live grant.
 */

const ENTITLED_STATUSES = ["ACTIVE", "COMPLETED"] as const;

export function isEnrollmentEntitled(status: string): boolean {
  return (ENTITLED_STATUSES as readonly string[]).includes(status);
}

/** For Prisma `status: { in: ENTITLED_ENROLLMENT_STATUSES }` filters — kept in sync with isEnrollmentEntitled above. */
export const ENTITLED_ENROLLMENT_STATUSES = ENTITLED_STATUSES;

/**
 * Prisma `_count` selector for CURRENTLY ENTITLED enrollments only, used
 * wherever a "students" figure is shown: a CANCELLED enrollment (e.g. after a
 * Phase 10 refund) is not a student who has access. A function (rather than
 * a shared constant) so it can be dropped into `as const` include objects
 * without turning the status list into a readonly tuple Prisma rejects.
 */
export function entitledEnrollmentsCount() {
  return { where: { status: { in: [...ENTITLED_STATUSES] } } };
}
