import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { DashboardLayout, DashboardHeader } from "@/components/layout/DashboardLayout";
import {
  Button,
  DataTable,
  Modal,
  Pagination,
  SearchBar,
  Select,
  StatCard,
  StatusBadge,
  Textarea,
} from "@/components/ui/kit";
import { useServerList } from "@/hooks/use-server-list";
import { compact, formatMoney, formatShortDate } from "@/lib/format";
import { getAdminOrdersFn } from "@/server/functions/checkout";
import { getAdminRefundsFn, refundOrderFn } from "@/server/functions/admin-finance";
import type { AdminOrderDTO } from "@/server/dto/checkout";
import type { RefundDto } from "@/server/dto/earnings";

export const Route = createFileRoute("/admin/payments")({
  loader: async () => {
    const [list, refunds] = await Promise.all([
      getAdminOrdersFn({ data: {} }),
      getAdminRefundsFn(),
    ]);
    return { list, refunds };
  },
  head: () => ({
    meta: [
      { title: "Payments — Learnora admin" },
      {
        name: "description",
        content: "Transactions and order status across the Learnora platform.",
      },
      { property: "og:title", content: "Payments — Learnora admin" },
      { property: "og:description", content: "Learnora payment records." },
    ],
  }),
  component: AdminPayments,
});

const STATUS_LABEL: Record<AdminOrderDTO["status"], string> = {
  PENDING: "Pending",
  PAID: "Completed",
  FAILED: "Failed",
  REFUNDED: "Refunded",
  PARTIALLY_REFUNDED: "Partially refunded",
};

function AdminPayments() {
  const { list, refunds } = Route.useLoaderData();
  const router = useRouter();
  const {
    data,
    filters,
    setFilter,
    page,
    setPage,
    loading,
    error: listError,
    reload,
  } = useServerList({
    initial: list,
    initialFilters: { search: "", status: "", refund: "", sort: "newest" },
    fetcher: (p) =>
      getAdminOrdersFn({
        data: {
          page: p.page,
          sort: p.sort as "newest" | "oldest",
          ...(p.search && { search: p.search }),
          ...(p.status && { status: p.status as AdminOrderDTO["status"] }),
          ...(p.refund && { refund: p.refund as "refunded" | "not_refunded" }),
        },
      }),
  });
  const [refunding, setRefunding] = useState<AdminOrderDTO | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function closeRefund() {
    if (busy) return;
    setRefunding(null);
    setReason("");
    setError("");
  }

  async function confirmRefund() {
    if (!refunding || busy) return;
    setBusy(true);
    setError("");
    try {
      // Only the order id (and an optional note) is sent — the server derives
      // payment, amount, student, course and the instructor earning itself.
      const result = await refundOrderFn({
        data: reason.trim()
          ? { orderId: refunding.orderId, reason: reason.trim() }
          : { orderId: refunding.orderId },
      });
      if (!result.success) setError(result.error);
      // Refresh on success AND failure (e.g. "already refunded") so the row is never stale:
      // the loader (summary cards + refund history) and the current filtered page.
      await Promise.all([router.invalidate(), reload()]);
      if (result.success) {
        setRefunding(null);
        setReason("");
      }
    } finally {
      setBusy(false);
    }
  }

  const { summary } = data;
  const usd = (n: number) => formatMoney(n, summary.currency);

  return (
    <DashboardLayout role="admin">
      <DashboardHeader
        title="Payments"
        description="Real order/payment records — payments and refunds run in test mode; no real money moves."
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Gross collected" value={usd(summary.grossCollected)} />
        <StatCard label="Refunded" value={usd(summary.refundedVolume)} />
        <StatCard label="Net collected" value={usd(summary.netCollected)} />
        <StatCard label="Failed payments" value={compact(summary.failedCount)} />
      </div>
      <p className="-mt-4 mb-8 text-xs text-muted-foreground">
        Gross = paid + refunded orders; Net = gross − refunded (matches dashboard platform revenue).
        Not instructor earnings, and not affected by the filters below.
      </p>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="min-w-64 flex-1">
          <SearchBar
            placeholder="Search order number, student name or email"
            value={filters.search}
            onChange={(v) => setFilter("search", v)}
          />
        </div>
        <Select
          value={filters.status}
          onChange={(e) => setFilter("status", e.target.value)}
          className="w-full sm:w-44"
          aria-label="Filter by payment status"
        >
          <option value="">All statuses</option>
          <option value="PAID">Completed</option>
          <option value="PENDING">Pending</option>
          <option value="FAILED">Failed</option>
          <option value="REFUNDED">Refunded</option>
        </Select>
        <Select
          value={filters.refund}
          onChange={(e) => setFilter("refund", e.target.value)}
          className="w-full sm:w-44"
          aria-label="Filter by refund state"
        >
          <option value="">Refunded or not</option>
          <option value="refunded">Refunded only</option>
          <option value="not_refunded">Not refunded</option>
        </Select>
        <Select
          value={filters.sort}
          onChange={(e) => setFilter("sort", e.target.value)}
          className="w-full sm:w-40"
          aria-label="Sort by date"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </Select>
      </div>

      {listError && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {listError}
        </p>
      )}

      <DataTable<AdminOrderDTO>
        caption="Payments"
        empty={loading ? "Loading…" : "No orders match these filters."}
        rows={data.orders}
        columns={[
          {
            key: "orderNumber",
            header: "Order",
            render: (o) => <span className="font-mono text-xs">{o.orderNumber}</span>,
          },
          {
            key: "createdAt",
            header: "Date",
            render: (o) => formatShortDate(o.createdAt),
          },
          { key: "studentName", header: "Student", render: (o) => o.studentName },
          { key: "courseTitle", header: "Course", render: (o) => o.courseTitle },
          {
            key: "paymentProvider",
            header: "Provider",
            render: (o) => <span className="font-mono text-xs">{o.paymentProvider ?? "—"}</span>,
          },
          {
            key: "status",
            header: "Status",
            render: (o) => <StatusBadge status={STATUS_LABEL[o.status]} />,
          },
          {
            key: "amount",
            header: "Amount",
            className: "text-right",
            render: (o) => formatMoney(o.amount, o.currency),
          },
          {
            key: "actions",
            header: "Refund",
            className: "text-right",
            render: (o) =>
              o.refundable ? (
                <Button size="sm" variant="outline" onClick={() => setRefunding(o)}>
                  Refund
                </Button>
              ) : o.refund ? (
                <span className="font-mono text-[11px] text-muted-foreground">
                  {o.refund.reference}
                  {o.refund.processedAt ? ` · ${formatShortDate(o.refund.processedAt)}` : ""}
                </span>
              ) : o.refundBlockedReason ? (
                <span className="block max-w-56 text-right text-[11px] leading-snug text-warn">
                  {o.refundBlockedReason}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              ),
          },
        ]}
      />
      <Pagination
        page={page}
        pageSize={data.pageSize}
        total={data.total}
        onChange={setPage}
        disabled={loading}
      />

      <section className="mt-12">
        <h2 className="mb-5 font-display text-2xl tracking-tight">Refund history</h2>
        <DataTable<RefundDto>
          caption="Refund history"
          empty="No refunds have been issued."
          rows={refunds}
          columns={[
            {
              key: "reference",
              header: "Refund",
              render: (r) => <span className="font-mono text-xs">{r.reference}</span>,
            },
            {
              key: "orderNumber",
              header: "Order",
              render: (r) => <span className="font-mono text-xs">{r.orderNumber}</span>,
            },
            { key: "studentName", header: "Student", render: (r) => r.studentName },
            { key: "courseTitle", header: "Course", render: (r) => r.courseTitle },
            { key: "createdAt", header: "Date", render: (r) => formatShortDate(r.createdAt) },
            {
              key: "status",
              header: "Status",
              render: (r) => (
                <StatusBadge status={r.status === "PROCESSED" ? "Refunded" : r.status} />
              ),
            },
            {
              key: "amount",
              header: "Amount",
              className: "text-right",
              render: (r) => formatMoney(r.amount, r.currency),
            },
          ]}
        />
      </section>

      <Modal
        open={refunding !== null}
        onClose={closeRefund}
        title="Refund this order?"
        description="Simulated — no real money moves."
        footer={
          <>
            <Button variant="outline" onClick={closeRefund} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmRefund} disabled={busy}>
              {busy ? "Refunding…" : "Issue full refund"}
            </Button>
          </>
        }
      >
        {refunding && (
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              {refunding.studentName} · {refunding.courseTitle} ·{" "}
              <span className="text-cream">
                {formatMoney(refunding.amount, refunding.currency)}
              </span>{" "}
              <span className="font-mono text-xs">({refunding.orderNumber})</span>
            </p>
            <p>
              This refunds the full amount, cancels the student's access to the course, and reverses
              the instructor's earning for this sale. It can't be undone.
            </p>
            <Textarea
              placeholder="Reason (optional)"
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            {error && <p className="text-destructive">{error}</p>}
          </div>
        )}
      </Modal>
    </DashboardLayout>
  );
}
