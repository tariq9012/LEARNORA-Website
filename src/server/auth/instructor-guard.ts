import { prisma } from "../db/client";
import { assertValidCsrfToken } from "./csrf";
import { ForbiddenError, UnauthorizedError, requireInstructor } from "./guards";
import { getRawSessionToken } from "./session";
import type { SafeUser } from "./types";

export type ApprovedInstructor = SafeUser & { instructorProfileId: string };

/**
 * Requires an authenticated INSTRUCTOR whose InstructorProfile is
 * APPROVED. A PENDING or REJECTED instructor can still reach their
 * dashboard (requireInstructor() alone is enough for that) but must not
 * be able to create, edit, or submit course content — that's what this
 * guard exists to block, server-side, regardless of what the UI shows.
 */
export async function requireApprovedInstructor(): Promise<ApprovedInstructor> {
  const user = await requireInstructor();

  const profile = await prisma.instructorProfile.findUnique({
    where: { userId: user.id },
    select: { id: true, approvalStatus: true },
  });

  if (!profile || profile.approvalStatus !== "APPROVED") {
    throw new ForbiddenError(
      "Your instructor account is still pending approval. You can't create or publish courses yet.",
    );
  }

  return { ...user, instructorProfileId: profile.id };
}

/**
 * Same as requireApprovedInstructor(), plus verifies the `X-CSRF-Token`
 * header (see csrf.ts). Use this — never the plain version — as the
 * guard for every state-changing raw media route (the 8 POST/DELETE
 * handlers across src/routes/api.instructor.media.*.ts and
 * src/routes/media.*.ts's resource remove). Those are server ROUTES
 * (server.handlers), a different dispatch path from createServerFn, so
 * they don't get TanStack Start's built-in server-function CSRF
 * middleware automatically — this closes that gap explicitly.
 *
 * Do not use this for createServerFn-based mutations (the framework
 * already protects those) or for read-only GET handlers (nothing to
 * protect — they only ever return data the caller is already authorized
 * to see, verified by canViewAsset()).
 */
export async function requireApprovedInstructorWithCsrf(): Promise<ApprovedInstructor> {
  const instructor = await requireApprovedInstructor();
  // requireApprovedInstructor() above already proved a valid session
  // cookie exists (it can't succeed otherwise), so a missing raw token
  // here would be a genuine surprise — but check anyway rather than
  // passing null into the HMAC as a string.
  const rawToken = getRawSessionToken();
  if (!rawToken) throw new UnauthorizedError();
  assertValidCsrfToken(rawToken);
  return instructor;
}

/**
 * Requires an authenticated INSTRUCTOR and returns their approval status,
 * without enforcing it — used to show a "pending approval" banner. Never
 * use this in place of requireApprovedInstructor() for anything that
 * actually creates/edits/publishes content.
 */
export async function getMyInstructorApprovalStatus(): Promise<
  "PENDING" | "APPROVED" | "REJECTED"
> {
  const user = await requireInstructor();
  const profile = await prisma.instructorProfile.findUnique({
    where: { userId: user.id },
    select: { approvalStatus: true },
  });
  return profile?.approvalStatus ?? "PENDING";
}
