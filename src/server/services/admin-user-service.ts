import { ForbiddenError } from "../auth/guards";
import * as repo from "../repositories/admin-user-repository";
import { publicAssetUrl } from "../media/media-urls";
import { resolvePagination } from "../validation/pagination";
import {
  listAdminStudentsSchema,
  listAdminUsersSchema,
  setUserStatusSchema,
} from "../validation/admin";
import type { SafeUser } from "../auth/types";
import type { AdminStudentListDTO, AdminUserDTO, AdminUserListDTO } from "../dto/admin";

export class UserAdminError extends Error {}

function assertAdmin(user: SafeUser) {
  if (user.role !== "ADMIN") throw new ForbiddenError("Only admins can do that.");
}

const avatarOf = (u: { avatarAssetId: string | null; avatar: string | null }) =>
  u.avatarAssetId ? publicAssetUrl(u.avatarAssetId) : u.avatar;

const money = (v: { toString(): string } | null | undefined) =>
  Math.round(Number(v?.toString() ?? 0) * 100) / 100;

export async function listAdminUsers(admin: SafeUser, input: unknown): Promise<AdminUserListDTO> {
  assertAdmin(admin);
  const parsed = listAdminUsersSchema.parse(input ?? {});
  const { page, pageSize, skip, take } = resolvePagination(parsed);
  const filters: repo.AdminUserFilters = {
    ...(parsed.search && { search: parsed.search }),
    ...(parsed.role && { role: parsed.role }),
    ...(parsed.status && { status: parsed.status }),
    ...(parsed.sort && { sort: parsed.sort }),
  };
  const [rows, total] = await Promise.all([
    repo.listUsersForAdmin(filters, skip, take),
    repo.countUsersForAdmin(filters),
  ]);

  const users: AdminUserDTO[] = rows.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    avatarUrl: avatarOf(u),
    role: u.role,
    status: u.status,
    emailVerified: u.emailVerified,
    joinedAt: u.createdAt.toISOString(),
    instructorApproval:
      u.role === "INSTRUCTOR" ? (u.instructorProfile?.approvalStatus ?? "PENDING") : null,
    statusEditable: u.id !== admin.id && u.role !== "ADMIN",
  }));
  return { users, total, page, pageSize };
}

export async function listAdminStudents(
  admin: SafeUser,
  input: unknown,
): Promise<AdminStudentListDTO> {
  assertAdmin(admin);
  const parsed = listAdminStudentsSchema.parse(input ?? {});
  const { page, pageSize, skip, take } = resolvePagination(parsed);
  // role is forced server-side; a client can never widen this list beyond STUDENT.
  const filters: repo.AdminUserFilters = {
    role: "STUDENT",
    ...(parsed.search && { search: parsed.search }),
    ...(parsed.status && { status: parsed.status }),
    ...(parsed.sort && { sort: parsed.sort }),
  };
  const [rows, total] = await Promise.all([
    repo.listUsersForAdmin(filters, skip, take),
    repo.countUsersForAdmin(filters),
  ]);

  const ids = rows.map((r) => r.id);
  // Three grouped queries for the whole page — never one per student.
  const [enrollments, certificates, spend] = ids.length
    ? await Promise.all([
        repo.enrollmentCountsByUser(ids),
        repo.certificateCountsByUser(ids),
        repo.paidOrderTotalsByUser(ids),
      ])
    : [[], [], []];

  const countFor = (userId: string, status: "ACTIVE" | "COMPLETED") =>
    enrollments.find((e) => e.userId === userId && e.status === status)?._count._all ?? 0;
  const certFor = new Map(certificates.map((c) => [c.userId, c._count._all]));
  const spendFor = new Map(spend.map((s) => [s.userId, money(s._sum.amount)]));

  return {
    total,
    page,
    pageSize,
    students: rows.map((u) => {
      const active = countFor(u.id, "ACTIVE");
      const completed = countFor(u.id, "COMPLETED");
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        avatarUrl: avatarOf(u),
        status: u.status,
        joinedAt: u.createdAt.toISOString(),
        headline: u.studentProfile?.headline ?? null,
        enrollmentCount: active + completed,
        activeEnrollments: active,
        completedCourses: completed,
        certificateCount: certFor.get(u.id) ?? 0,
        netSpend: spendFor.get(u.id) ?? 0,
        currency: "USD",
      };
    }),
  };
}

/**
 * ADMIN-only account moderation. Policy:
 *  - never your own account (prevents an admin locking themselves out)
 *  - never another ADMIN (no admin-vs-admin lockouts; demotion/removal of admins is out of scope)
 *  - only ACTIVE / SUSPENDED / BANNED — the statuses login + getSessionUser() enforce
 *  - non-ACTIVE revokes all of the user's sessions immediately
 *  - never deletes anything: orders, payments, reviews, messages, certificates stay intact
 */
export async function setUserStatus(admin: SafeUser, input: unknown): Promise<void> {
  assertAdmin(admin);
  const { userId, status } = setUserStatusSchema.parse(input);
  if (userId === admin.id)
    throw new UserAdminError("You can't change the status of your own account.");

  const target = await repo.findUserForStatusChange(userId);
  if (!target) throw new UserAdminError("User not found.");
  if (target.role === "ADMIN")
    throw new UserAdminError("Administrator accounts can't be suspended or banned here.");
  if (target.status === status) throw new UserAdminError("The account already has that status.");

  const changed = await repo.changeUserStatus(userId, status);
  if (changed !== 1)
    throw new UserAdminError(
      "The account changed while you were editing it. Reload and try again.",
    );
}
