import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Banknote, Clock3, CircleCheck } from "lucide-react";
import { DashboardLayout, DashboardHeader } from "@/components/layout/DashboardLayout";
import { Badge, Button, DataTable, Modal, Select, StatCard, Textarea } from "@/components/ui/kit";
import { formatMoney, formatShortDate } from "@/lib/format";
import {
  approvePayoutFn,
  getAdminPayoutsFn,
  rejectPayoutFn,
} from "@/server/functions/admin-finance";
import type { AdminPayoutDto, PayoutStatusDto } from "@/server/dto/earnings";

export const Route = createFileRoute("/admin/payouts")({
  loader: async () => ({ payouts: await getAdminPayoutsFn() }),
  head: () => ({
    meta: [
      { title: "Payouts — Learnora admin" },
      {
        name: "description",
        content: "Review and process instructor payout requests (simulated).",
      },
      { property: "og:title", content: "Payouts — Learnora admin" },
      { property: "og:description", content: "Learnora instructor payouts." },
    ],
  }),
  component: AdminPayouts,
});

const STATUS: Record<PayoutStatusDto, { label: string; tone: "good" | "warn" | "danger" }> = {
  PENDING: { label: "Pending", tone: "warn" },
  PROCESSING: { label: "Processing", tone: "warn" },
  PAID: { label: "Paid (simulated)", tone: "good" },
  FAILED: { label: "Failed", tone: "danger" },
  REJECTED: { label: "Rejected", tone: "danger" },
};

type Action = { kind: "approve" | "reject"; payout: AdminPayoutDto };

function AdminPayouts() {
  const { payouts } = Route.useLoaderData();
  const router = useRouter();
  const [status, setStatus] = useState("all");
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const rows = payouts.filter((p) => (status === "all" ? true : p.status === status));
  const open = payouts.filter((p) => p.status === "PENDING" || p.status === "PROCESSING");

  function close() {
    if (busy) return;
    setAction(null);
    setReason("");
    setError("");
  }

  async function confirm() {
    if (!action || busy) return;
    setBusy(true);
    setError("");
    try {
      const result =
        action.kind === "approve"
          ? await approvePayoutFn({ data: { payoutId: action.payout.id } })
          : await rejectPayoutFn({
              data: reason.trim()
                ? { payoutId: action.payout.id, reason: reason.trim() }
                : { payoutId: action.payout.id },
            });
      if (!result.success) setError(result.error);
      // Refresh on success AND failure (e.g. "already processed") so the table is never stale.
      await router.invalidate();
      if (result.success) {
        setAction(null);
        setReason("");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <DashboardLayout role="admin">
      <DashboardHeader
        title="Payouts"
        description="Instructor payout requests. Simulated — no real funds are transferred."
      />

      <p role="note" className="mb-6 rounded-xl bg-panel-2 px-4 py-3 text-sm ring-1 ring-line">
        <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
          Simulated
        </span>
        <span className="ml-3">
          No real funds are transferred. Marking a payout paid only updates Learnora's records.
        </span>
      </p>

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <StatCard label="Awaiting decision" value={open.length} icon={Clock3} />
        <StatCard
          label="Amount awaiting"
          value={formatMoney(open.reduce((n, p) => n + Number(p.amount), 0))}
          hint="Display total"
          icon={Banknote}
        />
        <StatCard
          label="Paid (simulated)"
          value={payouts.filter((p) => p.status === "PAID").length}
          icon={CircleCheck}
        />
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="w-full sm:w-48"
        >
          <option value="all">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="PAID">Paid</option>
          <option value="REJECTED">Rejected</option>
        </Select>
      </div>

      <DataTable<AdminPayoutDto>
        caption="Payouts"
        empty="No payout requests match this filter."
        rows={rows}
        columns={[
          {
            key: "reference",
            header: "Reference",
            render: (p) => <span className="font-mono text-xs">{p.reference}</span>,
          },
          {
            key: "instructor",
            header: "Instructor",
            render: (p) => (
              <div>
                <p>{p.instructorName}</p>
                <p className="font-mono text-[10px] text-muted-foreground">{p.instructorEmail}</p>
              </div>
            ),
          },
          {
            key: "requestedAt",
            header: "Requested",
            render: (p) => formatShortDate(p.requestedAt),
          },
          {
            key: "status",
            header: "Status",
            render: (p) => (
              <div>
                <Badge tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Badge>
                {p.processedAt && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {formatShortDate(p.processedAt)}
                    {p.processedByName ? ` · ${p.processedByName}` : ""}
                  </p>
                )}
              </div>
            ),
          },
          {
            key: "amount",
            header: "Amount",
            className: "text-right",
            render: (p) => formatMoney(p.amount, p.currency),
          },
          {
            key: "actions",
            header: "Actions",
            className: "text-right",
            render: (p) =>
              p.status === "PENDING" ? (
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setAction({ kind: "reject", payout: p })}
                  >
                    Reject
                  </Button>
                  <Button size="sm" onClick={() => setAction({ kind: "approve", payout: p })}>
                    Approve &amp; mark paid
                  </Button>
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              ),
          },
        ]}
      />

      <Modal
        open={action !== null}
        onClose={close}
        title={action?.kind === "approve" ? "Mark payout as paid?" : "Reject payout?"}
        description="Simulated — no real funds are transferred."
        footer={
          <>
            <Button variant="outline" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant={action?.kind === "reject" ? "destructive" : "primary"}
              onClick={confirm}
              disabled={busy}
            >
              {busy ? "Working…" : action?.kind === "approve" ? "Mark as paid" : "Reject payout"}
            </Button>
          </>
        }
      >
        {action && (
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              {action.payout.instructorName} ·{" "}
              {formatMoney(action.payout.amount, action.payout.currency)} ·{" "}
              <span className="font-mono text-xs">{action.payout.reference}</span>
            </p>
            {action.kind === "approve" ? (
              <p>The payout and its reserved earnings become Paid. This can't be undone.</p>
            ) : (
              <>
                <p>The reserved earnings return to the instructor's available balance.</p>
                <Textarea
                  placeholder="Reason (optional, shown to the instructor)"
                  maxLength={300}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </>
            )}
            {error && <p className="text-destructive">{error}</p>}
          </div>
        )}
      </Modal>
    </DashboardLayout>
  );
}
