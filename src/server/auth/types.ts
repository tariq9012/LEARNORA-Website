/**
 * The subset of User fields that are safe to send to the browser (via
 * router context, server function responses, etc). Never includes
 * passwordHash or anything session-related.
 *
 * Deliberately has no imports from Prisma or any other server-only
 * module — just plain types plus one tiny pure function — so this file
 * is safe to import from client-rendered components like the navbar.
 */
export type SafeUser = {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  role: "STUDENT" | "INSTRUCTOR" | "ADMIN";
  status: "ACTIVE" | "SUSPENDED" | "BANNED";
};

/** Strips a full User record (with passwordHash, etc.) down to SafeUser. */
export function toSafeUser(user: {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  role: string;
  status: string;
}): SafeUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    role: user.role as SafeUser["role"],
    status: user.status as SafeUser["status"],
  };
}
