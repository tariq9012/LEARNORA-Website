import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Flag } from "lucide-react";
import { DashboardLayout, DashboardHeader } from "@/components/layout/DashboardLayout";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  Modal,
  Select,
  StatCard,
  Textarea,
} from "@/components/ui/kit";
import { formatShortDate } from "@/lib/format";
import {
  dismissReportFn,
  getAdminReportFn,
  getAdminReportsFn,
  resolveReportFn,
} from "@/server/functions/moderation";
import type {
  AdminReportDetailDto,
  AdminReportDto,
  ReportActionDto,
  ReportStatusDto,
} from "@/server/dto/moderation";

export const Route = createFileRoute("/admin/reports")({
  loader: async () => ({ page: await getAdminReportsFn({ data: {} }) }),
  head: () => ({
    meta: [
      { title: "Reports — Learnora admin" },
      { name: "description", content: "Moderation queue for reported reviews and messages." },
      { property: "og:title", content: "Reports — Learnora admin" },
      { property: "og:description", content: "Learnora moderation queue." },
    ],
  }),
  component: AdminReports,
});

const STATUS: Record<
  ReportStatusDto,
  { label: string; tone: "good" | "warn" | "soft" | "danger" }
> = {
  OPEN: { label: "Open", tone: "warn" },
  IN_REVIEW: { label: "In review", tone: "warn" },
  RESOLVED: { label: "Resolved", tone: "good" },
  DISMISSED: { label: "Dismissed", tone: "soft" },
};

function AdminReports() {
  const { page } = Route.useLoaderData();
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [targetType, setTargetType] = useState("");
  const [detail, setDetail] = useState<AdminReportDetailDto | null>(null);
  const [detailError, setDetailError] = useState("");
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [adminNote, setAdminNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  const rows = page.reports.filter(
    (r) => (!status || r.status === status) && (!targetType || r.targetType === targetType),
  );
  const openCount = page.reports.filter(
    (r) => r.status === "OPEN" || r.status === "IN_REVIEW",
  ).length;

  async function openDetail(report: AdminReportDto) {
    setDetail(null);
    setDetailError("");
    setActionError("");
    setAdminNote("");
    setLoadingDetail(true);
    const result = await getAdminReportFn({ data: { reportId: report.id } });
    setLoadingDetail(false);
    if (!result.success) {
      setDetailError(result.error);
      return;
    }
    setDetail(result.data);
  }

  function close() {
    if (busy) return;
    setDetail(null);
    setDetailError("");
  }

  async function act(action: ReportActionDto | "NO_ACTION" | "DISMISS") {
    if (!detail || busy) return;
    setBusy(true);
    setActionError("");
    try {
      const result =
        action === "DISMISS"
          ? await dismissReportFn({
              data: adminNote.trim()
                ? { reportId: detail.id, adminNote: adminNote.trim() }
                : { reportId: detail.id },
            })
          : await resolveReportFn({
              data: adminNote.trim()
                ? { reportId: detail.id, action, adminNote: adminNote.trim() }
                : { reportId: detail.id, action },
            });
      if (!result.success) {
        setActionError(result.error);
        return;
      }
      setDetail(null);
      await router.invalidate();
    } finally {
      setBusy(false);
    }
  }

  return (
    <DashboardLayout role="admin">
      <DashboardHeader
        title="Reports"
        description="Reported reviews and messages. Message reports show only the reported message, never the full conversation."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Needs review" value={openCount} icon={Flag} />
        <StatCard label="Total reports" value={page.total} />
        <StatCard
          label="Resolved"
          value={page.reports.filter((r) => r.status === "RESOLVED").length}
        />
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="w-full sm:w-48"
        >
          <option value="">All statuses</option>
          <option value="OPEN">Open</option>
          <option value="IN_REVIEW">In review</option>
          <option value="RESOLVED">Resolved</option>
          <option value="DISMISSED">Dismissed</option>
        </Select>
        <Select
          value={targetType}
          onChange={(e) => setTargetType(e.target.value)}
          className="w-full sm:w-48"
        >
          <option value="">Reviews & messages</option>
          <option value="REVIEW">Reviews</option>
          <option value="MESSAGE">Messages</option>
        </Select>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No reports match this filter"
          description="Reported reviews and messages will show up here."
        />
      ) : (
        <DataTable<AdminReportDto>
          caption="Reports"
          empty="No reports."
          rows={rows}
          columns={[
            {
              key: "targetType",
              header: "Type",
              render: (r) => (r.targetType === "REVIEW" ? "Review" : "Message"),
            },
            {
              key: "targetSummary",
              header: "Content",
              render: (r) => <span className="line-clamp-1">{r.targetSummary}</span>,
            },
            { key: "reason", header: "Reason", render: (r) => r.reason },
            { key: "reporterName", header: "Reporter", render: (r) => r.reporterName },
            { key: "createdAt", header: "Date", render: (r) => formatShortDate(r.createdAt) },
            {
              key: "status",
              header: "Status",
              render: (r) => <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>,
            },
            {
              key: "actions",
              header: "",
              className: "text-right",
              render: (r) => (
                <Button size="sm" variant="outline" onClick={() => void openDetail(r)}>
                  Review
                </Button>
              ),
            },
          ]}
        />
      )}

      <Modal
        open={detail !== null || loadingDetail}
        onClose={close}
        title="Report detail"
        description="Only the minimum necessary context is shown."
      >
        {loadingDetail && <p className="text-sm text-muted-foreground">Loading…</p>}
        {detailError && <p className="text-sm text-destructive">{detailError}</p>}
        {detail && (
          <div className="space-y-4">
            <div className="rounded-xl bg-panel-2 p-4 ring-1 ring-line">
              <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                Reason: {detail.reason} · Reported by {detail.reporterName} ·{" "}
                {formatShortDate(detail.createdAt)}
              </p>
              {detail.details && (
                <p className="mt-2 whitespace-pre-wrap text-sm">{detail.details}</p>
              )}
            </div>

            {detail.review && (
              <div className="rounded-xl bg-panel-2 p-4 ring-1 ring-line">
                <p className="text-xs text-muted-foreground">
                  Review by {detail.review.authorName} on “{detail.review.courseTitle}” —{" "}
                  {detail.review.rating}★
                  {detail.review.hidden && (
                    <span className="ml-2 text-destructive">(currently hidden)</span>
                  )}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm">
                  {detail.review.comment ?? "(no comment)"}
                </p>
              </div>
            )}

            {detail.message && (
              <div className="rounded-xl bg-panel-2 p-4 ring-1 ring-line">
                <p className="text-xs text-muted-foreground">
                  Message from {detail.message.senderName} (
                  {detail.message.senderRole.toLowerCase()})
                  {detail.message.courseTitle && <> — “{detail.message.courseTitle}”</>} —{" "}
                  {formatShortDate(detail.message.sentAt)}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm">{detail.message.content}</p>
                <p className="mt-2 font-mono text-[10px] text-muted-foreground">
                  Only this reported message is shown — not the surrounding conversation.
                </p>
              </div>
            )}

            {detail.status === "OPEN" || detail.status === "IN_REVIEW" ? (
              <div className="space-y-3 border-t border-line pt-4">
                <Textarea
                  placeholder="Admin note (private, optional)"
                  maxLength={500}
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                />
                {actionError && <p className="text-sm text-destructive">{actionError}</p>}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => void act("DISMISS")}
                  >
                    Dismiss
                  </Button>
                  {detail.targetType === "REVIEW" && !detail.review?.hidden && (
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={busy}
                      onClick={() => void act("REVIEW_HIDDEN")}
                    >
                      Hide review
                    </Button>
                  )}
                  {detail.targetType === "REVIEW" && detail.review?.hidden && (
                    <Button size="sm" disabled={busy} onClick={() => void act("REVIEW_RESTORED")}>
                      Restore review
                    </Button>
                  )}
                  {detail.targetType === "MESSAGE" && (
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={busy}
                      onClick={() => void act("MESSAGE_REMOVED")}
                    >
                      Remove message
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => void act("NO_ACTION")}
                  >
                    Mark handled (no action)
                  </Button>
                </div>
              </div>
            ) : (
              <div className="border-t border-line pt-4 text-sm text-muted-foreground">
                <p>
                  {detail.status === "RESOLVED" ? "Resolved" : "Dismissed"} by{" "}
                  {detail.resolvedByName ?? "an admin"}
                  {detail.action && <> — action: {detail.action}</>}
                </p>
                {detail.adminNote && <p className="mt-1 whitespace-pre-wrap">{detail.adminNote}</p>}
              </div>
            )}
          </div>
        )}
      </Modal>
    </DashboardLayout>
  );
}
