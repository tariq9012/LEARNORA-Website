import type { SafeUser } from "@/server/auth/types";

/** Where a logged-in user's dashboard/home lives, based on their database role. */
export function roleHomePath(role: SafeUser["role"]): string {
  switch (role) {
    case "ADMIN":
      return "/admin/dashboard";
    case "INSTRUCTOR":
      return "/instructor/dashboard";
    case "STUDENT":
    default:
      return "/student/dashboard";
  }
}
