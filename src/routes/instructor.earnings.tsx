import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Wallet, TrendingUp, CreditCard, Clock3 } from "lucide-react";
import { DashboardLayout, DashboardHeader } from "@/components/layout/DashboardLayout";
import { Badge, Button, Card, DataTable, Modal, StatCard } from "@/components/ui/kit";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { formatMoney, formatShortDate } from "@/lib/format";
import {
  getInstructorEarningsFn,
  getInstructorPayoutsFn,
  requestPayoutFn,
} from "@/server/functions/earnings";
import type {
  EarningStatusDto,
  InstructorEarningDto,
  PayoutDto,
  PayoutStatusDto,
} from "@/server/dto/earnings";

export const Route = createFileRoute("/instructor/earnings")({
  loader: async () => {
    const [earnings, payouts] = await Promise.all([
      getInstructorEarningsFn(),
      getInstructorPayoutsFn(),
    ]);
    return { earnings, payouts };
  },
  head: () => ({
    meta: [
      { title: "Earnings — Learnora instructor" },
      { name: "description", content: "Your Learnora course earnings, payouts and refunds." },
      { property: "og:title", content: "Earnings — Learnora instructor" },
      { property: "og:description", content: "Earnings and payouts for Learnora instructors." },
    ],
  }),
  component: InstructorEarnings,
});

const EARNING_LABEL: Record<
  EarningStatusDto,
  { label: string; tone: "good" | "warn" | "soft" | "danger" }
> = {
  AVAILABLE: { label: "Available", tone: "good" },
  RESERVED: { label: "In payout request", tone: "warn" },
  PAID: { label: "Paid out", tone: "soft" },
  REVERSED: { label: "Reversed (refund)", tone: "danger" },
};

const PAYOUT_LABEL: Record<
  PayoutStatusDto,
  { label: string; tone: "good" | "warn" | "soft" | "danger" }
> = {
  PENDING: { label: "Pending", tone: "warn" },
  PROCESSING: { label: "Processing", tone: "warn" },
  PAID: { label: "Paid (simulated)", tone: "good" },
  FAILED: { label: "Failed", tone: "danger" },
  REJECTED: { label: "Rejected", tone: "danger" },
};

function InstructorEarnings() {
  const { earnings: data, payouts } = Route.useLoaderData();
  const { summary } = data;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirmPayout() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      // The amount sent is only what the instructor SAW; the server pays out
      // its own computed balance and refuses if the two differ.
      const result = await requestPayoutFn({ data: { expectedAmount: summary.availableBalance } });
      if (!result.success) {
        setError(result.error);
      } else {
        setOpen(false);
      }
      // Refresh on success AND failure so balances/history are never stale.
      await router.invalidate();
    } finally {
      setBusy(false);
    }
  }

  return (
    <DashboardLayout role="instructor">
      <DashboardHeader
        title="Earnings"
        description="Real earnings from paid purchases. Payouts are simulated — no real funds are transferred."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Available balance"
          value={formatMoney(summary.availableBalance, summary.currency)}
          hint={`Minimum payout ${formatMoney(summary.minimumPayout, summary.currency)}`}
          icon={Wallet}
        />
        <StatCard
          label="Pending payout"
          value={formatMoney(summary.pendingPayout, summary.currency)}
          hint="Waiting for admin"
          icon={Clock3}
        />
        <StatCard
          label="Paid out"
          value={formatMoney(summary.paidOut, summary.currency)}
          icon={CreditCard}
        />
        <StatCard
          label="Total earned"
          value={formatMoney(summary.totalEarned, summary.currency)}
          hint={`${summary.revenueSharePercent}% instructor share · ${formatMoney(summary.reversedAmount, summary.currency)} reversed`}
          icon={TrendingUp}
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_340px]">
        <RevenueChart
          title="Monthly earnings"
          subtitle={`Last 6 months · after the ${100 - summary.revenueSharePercent}% platform share`}
          data={data.monthly}
        />
        <Card className="p-5">
          <h3 className="font-display text-lg tracking-tight">Payout method</h3>
          <div className="mt-4 rounded-xl bg-panel-2 p-4 ring-1 ring-line">
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
              Simulated payout account
            </p>
            <p className="mt-2 text-sm">No bank or card details are collected.</p>
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">
              SIMULATED · {summary.currency}
            </p>
          </div>
          <Button
            block
            className="mt-4"
            disabled={!summary.canRequestPayout || busy}
            onClick={() => {
              setError("");
              setOpen(true);
            }}
          >
            Request payout of {formatMoney(summary.availableBalance, summary.currency)}
          </Button>
          {summary.payoutBlockedReason && (
            <p className="mt-3 text-xs text-warn">{summary.payoutBlockedReason}</p>
          )}
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            Payouts withdraw your whole available balance once it reaches{" "}
            {formatMoney(summary.minimumPayout, summary.currency)}. No real funds are transferred.
          </p>
        </Card>
      </div>

      <section className="mt-12">
        <h2 className="mb-5 font-display text-2xl tracking-tight">Payout history</h2>
        <DataTable<PayoutDto>
          caption="Payout history"
          empty="No payout requests yet."
          rows={payouts}
          columns={[
            {
              key: "reference",
              header: "Reference",
              render: (p) => <span className="font-mono text-xs">{p.reference}</span>,
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
                  <Badge tone={PAYOUT_LABEL[p.status].tone}>{PAYOUT_LABEL[p.status].label}</Badge>
                  {p.rejectionReason && (
                    <p className="mt-1 text-[11px] text-muted-foreground">{p.rejectionReason}</p>
                  )}
                </div>
              ),
            },
            {
              key: "processedAt",
              header: "Paid on",
              render: (p) =>
                p.status === "PAID" && p.processedAt ? formatShortDate(p.processedAt) : "—",
            },
            {
              key: "amount",
              header: "Amount",
              className: "text-right",
              render: (p) => formatMoney(p.amount, p.currency),
            },
          ]}
        />
      </section>

      <section className="mt-12">
        <h2 className="mb-5 font-display text-2xl tracking-tight">Earning history</h2>
        <DataTable<InstructorEarningDto>
          caption="Earning history"
          empty="No paid sales yet. Earnings appear here when a student buys one of your courses."
          rows={data.earnings}
          columns={[
            {
              key: "orderNumber",
              header: "Order",
              render: (e) => <span className="font-mono text-xs">{e.orderNumber}</span>,
            },
            { key: "purchasedAt", header: "Date", render: (e) => formatShortDate(e.purchasedAt) },
            { key: "courseTitle", header: "Course", render: (e) => e.courseTitle },
            {
              key: "grossAmount",
              header: "Sale",
              className: "text-right",
              render: (e) => formatMoney(e.grossAmount, e.currency),
            },
            {
              key: "platformAmount",
              header: "Platform share",
              className: "text-right",
              render: (e) => formatMoney(e.platformAmount, e.currency),
            },
            {
              key: "netAmount",
              header: "Your earning",
              className: "text-right",
              render: (e) => formatMoney(e.netAmount, e.currency),
            },
            {
              key: "status",
              header: "Status",
              render: (e) => (
                <Badge tone={EARNING_LABEL[e.status].tone}>{EARNING_LABEL[e.status].label}</Badge>
              ),
            },
          ]}
        />
        {data.historyTruncated && (
          <p className="mt-3 text-xs text-muted-foreground">
            Showing your most recent earnings. Totals above include all of them.
          </p>
        )}
      </section>

      <Modal
        open={open}
        onClose={() => !busy && setOpen(false)}
        title="Request a simulated payout"
        description="No real funds are transferred."
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={confirmPayout} disabled={busy}>
              {busy
                ? "Requesting…"
                : `Request ${formatMoney(summary.availableBalance, summary.currency)}`}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          This reserves your entire available balance of{" "}
          <span className="text-cream">
            {formatMoney(summary.availableBalance, summary.currency)}
          </span>{" "}
          for an admin to review. Reserved earnings can't be requested again unless the payout is
          rejected.
        </p>
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      </Modal>
    </DashboardLayout>
  );
}
