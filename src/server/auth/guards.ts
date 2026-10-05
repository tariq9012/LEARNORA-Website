import { assertValidCsrfToken } from "./csrf";
import { getRawSessionToken, getSessionUser } from "./session";
import { toSafeUser, type SafeUser } from "./types";

export class UnauthorizedError extends Error {
  constructor(message = "Authentication required") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "You do not have permission to perform this action") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Returns the current user (safe fields only), or null if not authenticated. */
export async function getCurrentUser(): Promise<SafeUser | null> {
  const user = await getSessionUser();
  return user ? toSafeUser(user) : null;
}

/** Returns the current user, or throws UnauthorizedError. Server-function/service use only. */
export async function requireCurrentUser(): Promise<SafeUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export async function requireRole(role: SafeUser["role"]): Promise<SafeUser> {
  const user = await requireCurrentUser();
  if (user.role !== role) throw new ForbiddenError();
  return user;
}

export async function requireAnyRole(roles: ReadonlyArray<SafeUser["role"]>): Promise<SafeUser> {
  const user = await requireCurrentUser();
  if (!roles.includes(user.role)) throw new ForbiddenError();
  return user;
}

export const requireStudent = () => requireRole("STUDENT");
export const requireInstructor = () => requireRole("INSTRUCTOR");
export const requireAdmin = () => requireRole("ADMIN");

/**
 * Same as requireCurrentUser(), plus verifies the `X-CSRF-Token` header
 * (see csrf.ts). Use this — never the plain version — for state-changing
 * raw routes reachable by ANY authenticated role (currently: the account
 * avatar upload/remove route). requireApprovedInstructorWithCsrf() covers
 * the instructor-only media routes; this is the role-agnostic equivalent.
 */
export async function requireCurrentUserWithCsrf(): Promise<SafeUser> {
  const user = await requireCurrentUser();
  const rawToken = getRawSessionToken();
  if (!rawToken) throw new UnauthorizedError();
  assertValidCsrfToken(rawToken);
  return user;
}

/**
 * Enforces that the current user owns a resource (or is an admin).
 * Services must derive `ownerId` from the database record itself, never
 * from a client-supplied field — e.g. `course.instructorId`, not a
 * `userId` the browser sent in the request body.
 */
export function assertOwnsResourceOrAdmin(user: SafeUser, ownerId: string) {
  if (user.role !== "ADMIN" && user.id !== ownerId) {
    throw new ForbiddenError();
  }
}
