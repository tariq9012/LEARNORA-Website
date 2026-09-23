import { createFileRoute } from "@tanstack/react-router";
import { Wallet, TrendingUp, CreditCard, Clock3 } from "lucide-react";
import { DashboardLayout, DashboardHeader } from "@/components/layout/DashboardLayout";
import { Button, Card, DataTable, StatCard, StatusBadge } from "@/components/ui/kit";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { currency, payments, type Payment } from "@/data/mock";

export const Route = createFileRoute("/instructor/earnings")({
  head: () => ({
    meta: [
      { title: "Earnings — Learnora instructor" },
      { name: "description", content: "Your Learnora course revenue, payout schedule and transaction history." },
      { property: "og:title", content: "Earnings — Learnora instructor" },
      { property: "og:description", content: "Revenue and payouts for Learnora instructors." },
    ],
  }),
  component: InstructorEarnings,
});

function InstructorEarnings() {
  return (
    <DashboardLayout role="instructor">
      <DashboardHeader
        title="Earnings"
        description="Figures are illustrative — payouts are not processed in this preview."
        action={<Button variant="outline">Download statement</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Available balance" value={currency(8420)} icon={Wallet} />
        <StatCard label="This month" value={currency(36400)} hint="+26% vs August" icon={TrendingUp} />
        <StatCard label="Lifetime earnings" value={currency(284900)} icon={CreditCard} />
        <StatCard label="Next payout" value="15 Oct" hint="Bank transfer" icon={Clock3} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_340px]">
        <RevenueChart title="Monthly earnings" subtitle="After the 50% platform share" />
        <Card className="p-5">
          <h3 className="font-display text-lg tracking-tight">Payout method</h3>
          <div className="mt-4 rounded-xl bg-panel-2 p-4 ring-1 ring-line">
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Bank account</p>
            <p className="mt-2 text-sm">Novo Banco •••• 6612</p>
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">EUR · monthly on the 15th</p>
          </div>
          <Button variant="outline" block className="mt-4">
            Change payout method
          </Button>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            Payouts run once your balance passes $50. Statements are available for the last 24 months.
          </p>
        </Card>
      </div>

      <section className="mt-12">
        <h2 className="mb-5 font-display text-2xl tracking-tight">Recent transactions</h2>
        <DataTable<Payment>
          caption="Recent transactions"
          rows={payments}
          columns={[
            { key: "id", header: "Transaction", render: (p) => <span className="font-mono text-xs">{p.id}</span> },
            { key: "date", header: "Date", render: (p) => p.date },
            { key: "course", header: "Course", render: (p) => p.course },
            { key: "student", header: "Student", render: (p) => p.student },
            { key: "status", header: "Status", render: (p) => <StatusBadge status={p.status} /> },
            {
              key: "amount",
              header: "Your share",
              className: "text-right",
              render: (p) => currency(Math.round(p.amount * 0.5)),
            },
          ]}
        />
      </section>
    </DashboardLayout>
  );
}
