import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../db/client";

/**
 * Persistence for Report (Phase 12). No business rules here — eligibility,
 * snapshotting and admin authorization all live in report-service.ts /
 * moderation-service.ts. The partial unique index
 * `reports_active_reporter_target_key` (reporterId, targetType, targetId
 * WHERE status IN ('OPEN','IN_REVIEW')) is the database-level guard against
 * duplicate active reports; `create` below relies on catching its violation.
 */

export function findActiveByReporterAndTarget(
  reporterId: string,
  targetType: "REVIEW" | "MESSAGE",
  targetId: string,
) {
  return prisma.report.findFirst({
    where: { reporterId, targetType, targetId, status: { in: ["OPEN", "IN_REVIEW"] } },
    select: { id: true },
  });
}

export function create(data: {
  reporterId: string;
  targetType: "REVIEW" | "MESSAGE";
  targetId: string;
  reason: Prisma.ReportCreateInput["reason"];
  details: string | null;
  contentSnapshot?: Prisma.InputJsonValue;
}) {
  const { contentSnapshot, ...rest } = data;
  return prisma.report.create({
    data: contentSnapshot === undefined ? rest : { ...rest, contentSnapshot },
  });
}

export function listForReporter(reporterId: string, take = 50) {
  return prisma.report.findMany({
    where: { reporterId },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      targetType: true,
      reason: true,
      status: true,
      createdAt: true,
      resolvedAt: true,
    },
  });
}

const ADMIN_LIST_SELECT = {
  id: true,
  targetType: true,
  targetId: true,
  reason: true,
  details: true,
  status: true,
  createdAt: true,
  reporter: { select: { name: true } },
} as const;

export function listForAdmin(
  where: Prisma.ReportWhereInput,
  options: { skip: number; take: number },
) {
  return prisma.report.findMany({
    where,
    select: ADMIN_LIST_SELECT,
    orderBy: { createdAt: "desc" },
    skip: options.skip,
    take: options.take,
  });
}

export function countForAdmin(where: Prisma.ReportWhereInput) {
  return prisma.report.count({ where });
}

const ADMIN_DETAIL_SELECT = {
  ...ADMIN_LIST_SELECT,
  action: true,
  adminNote: true,
  contentSnapshot: true,
  resolvedBy: { select: { name: true } },
} as const;

export function findByIdForAdmin(reportId: string) {
  return prisma.report.findUnique({ where: { id: reportId }, select: ADMIN_DETAIL_SELECT });
}

/** Conditional: only a still-OPEN/IN_REVIEW report can be resolved or dismissed — a double-click / two admins race here and the loser matches 0 rows. */
export function decideInTx(
  tx: Prisma.TransactionClient,
  params: {
    reportId: string;
    status: "RESOLVED" | "DISMISSED";
    action: "REVIEW_HIDDEN" | "REVIEW_RESTORED" | "MESSAGE_REMOVED" | null;
    adminNote: string | null;
    adminId: string;
  },
) {
  return tx.report.updateMany({
    where: { id: params.reportId, status: { in: ["OPEN", "IN_REVIEW"] } },
    data: {
      status: params.status,
      action: params.action,
      adminNote: params.adminNote,
      resolvedById: params.adminId,
      resolvedAt: new Date(),
    },
  });
}

export function findRawById(reportId: string) {
  return prisma.report.findUnique({ where: { id: reportId } });
}
