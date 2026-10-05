import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2 } from "lucide-react";

import { DashboardLayout, DashboardHeader } from "@/components/layout/DashboardLayout";
import { SecurityPanel } from "@/components/account/SecurityPanel";
import { Button, Card, EmptyState, FormField, Input, StatusBadge, Tabs } from "@/components/ui/kit";
import { NotificationPreferencesPanel } from "@/components/dashboard/NotificationPreferencesPanel";
import { MyReportsPanel } from "@/components/dashboard/MyReportsPanel";
import { formatMoney, formatMonthYear } from "@/lib/format";
import {
  getBillingSummaryFn,
  getMyAccountFn,
  updateMyAccountNameFn,
} from "@/server/functions/account";
import type { AccountOverviewDTO, BillingSummaryDTO } from "@/server/dto/account";
import type { PurchaseHistoryItemDTO } from "@/server/dto/checkout";

export const Route = createFileRoute("/student/settings")({
  loader: async () => {
    const [account, billing] = await Promise.all([getMyAccountFn(), getBillingSummaryFn()]);
    return { account, billing };
  },
  head: () => ({
    meta: [
      { title: "Settings — Learnora" },
      {
        name: "description",
        content: "Account, notification and billing preferences for your Learnora account.",
      },
      { property: "og:title", content: "Settings — Learnora" },
      { property: "og:description", content: "Manage your Learnora account settings." },
    ],
  }),
  component: StudentSettings,
});

const STATUS_LABEL: Record<PurchaseHistoryItemDTO["status"], string> = {
  PENDING: "Pending",
  PAID: "Completed",
  FAILED: "Failed",
  REFUNDED: "Refunded",
  PARTIALLY_REFUNDED: "Partially refunded",
};

function StudentSettings() {
  const { account: initialAccount, billing } = Route.useLoaderData();
  const [account, setAccount] = useState<AccountOverviewDTO>(initialAccount);
  const [tab, setTab] = useState("account");

  return (
    <DashboardLayout role="student">
      <DashboardHeader title="Settings" description="Manage your account, security and billing." />

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "account", label: "Account" },
          { id: "security", label: "Security" },
          { id: "notifications", label: "Notifications" },
          { id: "reports", label: "My reports" },
          { id: "billing", label: "Billing" },
        ]}
      />

      <div className="mt-8">
        {tab === "account" && <AccountTab account={account} onChange={setAccount} />}
        {tab === "security" && <SecurityPanel />}
        {tab === "notifications" && (
          <Card className="max-w-2xl p-6">
            <NotificationPreferencesPanel />
          </Card>
        )}
        {tab === "reports" && (
          <Card className="max-w-2xl p-6">
            <MyReportsPanel />
          </Card>
        )}
        {tab === "billing" && <BillingTab billing={billing} />}
      </div>

      {tab === "account" && (
        <Card className="mt-6 max-w-2xl border-destructive/30 p-6">
          <h2 className="font-display text-lg tracking-tight">Delete account</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Account deletion isn't available yet — removing an account with enrolments, orders,
            certificates or reviews would break that history for other people (refund records,
            reviews you've left, etc). If you need your account deactivated in the meantime, contact
            support.
          </p>
          <Button variant="destructive" className="mt-4" disabled>
            Delete account
          </Button>
        </Card>
      )}
    </DashboardLayout>
  );
}

function AccountTab({
  account,
  onChange,
}: {
  account: AccountOverviewDTO;
  onChange: (account: AccountOverviewDTO) => void;
}) {
  const [name, setName] = useState(account.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSaved(false);
    const result = await updateMyAccountNameFn({ data: { name } });
    setBusy(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    onChange(result.data);
    setSaved(true);
  }

  return (
    <Card className="max-w-2xl p-6">
      <form onSubmit={handleSubmit} className="space-y-5">
        <FormField label="Full name">
          <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
        </FormField>
        <FormField
          label="Email address"
          hint="Email changes aren't available yet — contact support if you need this updated."
        >
          <Input type="email" value={account.email} disabled />
        </FormField>
        <FormField label="Account type">
          <Input value={account.role === "STUDENT" ? "Student" : account.role} disabled />
        </FormField>
        <FormField label="Member since">
          <Input value={formatMonthYear(new Date(account.joinedAt))} disabled />
        </FormField>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
          <Button type="submit" disabled={busy}>
            {busy && <Loader2 size={14} className="animate-spin" />}
            Save changes
          </Button>
          {saved && !error && <span className="font-mono text-[11px] text-good">Saved</span>}
        </div>
      </form>
    </Card>
  );
}

function BillingTab({ billing }: { billing: BillingSummaryDTO }) {
  return (
    <div className="max-w-2xl space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            Total orders
          </p>
          <p className="mt-2 font-display text-2xl tracking-tight">{billing.totalOrders}</p>
        </Card>
        <Card className="p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            Total spent
          </p>
          <p className="mt-2 font-display text-2xl tracking-tight">
            {formatMoney(billing.totalSpent)}
          </p>
        </Card>
      </div>

      <div className="rounded-xl bg-panel-2 p-4 text-sm ring-1 ring-line">
        Learnora's payment provider is a simulated test-mode provider — no real card or bank details
        are collected or stored.
      </div>

      {billing.recent.length === 0 ? (
        <EmptyState title="No purchases yet" description="Your recent orders will show up here." />
      ) : (
        <Card className="p-4">
          <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            Recent orders
          </p>
          <ul className="space-y-3">
            {billing.recent.map((p) => (
              <li key={p.orderId} className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{p.courseTitle}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {p.orderNumber} · {formatMonthYear(new Date(p.createdAt))}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={STATUS_LABEL[p.status]} />
                  <span className="text-sm font-medium">{formatMoney(p.amount)}</span>
                </div>
              </li>
            ))}
          </ul>
          <Link
            to="/student/purchases"
            className="mt-4 inline-block text-sm text-brand-soft hover:underline"
          >
            View full purchase history →
          </Link>
        </Card>
      )}
    </div>
  );
}
