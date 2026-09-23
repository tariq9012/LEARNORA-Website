import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { DashboardLayout, DashboardHeader } from "@/components/layout/DashboardLayout";
import { DataTable, SearchBar, Select, StatCard, StatusBadge } from "@/components/ui/kit";
import { currency } from "@/data/mock";
import { formatMonthYear } from "@/lib/format";
import { getAdminOrdersFn } from "@/server/functions/checkout";
import type { AdminOrderDTO } from "@/server/dto/checkout";

export const Route = createFileRoute("/admin/payments")({
  loader: async () => ({ orders: await getAdminOrdersFn() }),
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
  const { orders } = Route.useLoaderData();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");

  const rows = orders
    .filter((o) => (status === "all" ? true : o.status === status))
    .filter((o) =>
      `${o.orderNumber} ${o.studentName} ${o.courseTitle}`.toLowerCase().includes(q.toLowerCase()),
    );

  const captured = orders.filter((o) => o.status === "PAID").reduce((n, o) => n + o.amount, 0);

  return (
    <DashboardLayout role="admin">
      <DashboardHeader
        title="Payments"
        description="Real order/payment records — payments run in test mode (see Phase 9)."
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <StatCard label="Captured (all time)" value={currency(captured)} />
        <StatCard label="Failed" value={orders.filter((o) => o.status === "FAILED").length} />
        <StatCard label="Pending" value={orders.filter((o) => o.status === "PENDING").length} />
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="min-w-64 flex-1">
          <SearchBar placeholder="Search order, student or course" value={q} onChange={setQ} />
        </div>
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="w-full sm:w-48"
        >
          <option value="all">All statuses</option>
          <option value="PAID">Completed</option>
          <option value="PENDING">Pending</option>
          <option value="FAILED">Failed</option>
          <option value="REFUNDED">Refunded</option>
        </Select>
      </div>

      <DataTable<AdminOrderDTO>
        caption="Payments"
        empty="No orders match this filter."
        rows={rows}
        columns={[
          {
            key: "orderNumber",
            header: "Order",
            render: (o) => <span className="font-mono text-xs">{o.orderNumber}</span>,
          },
          {
            key: "createdAt",
            header: "Date",
            render: (o) => formatMonthYear(new Date(o.createdAt)),
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
            render: (o) => currency(o.amount),
          },
        ]}
      />
    </DashboardLayout>
  );
}
