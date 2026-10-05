import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2 } from "lucide-react";

import { DashboardLayout, DashboardHeader } from "@/components/layout/DashboardLayout";
import { SecurityPanel } from "@/components/account/SecurityPanel";
import { Button, Card, FormField, Input, Tabs } from "@/components/ui/kit";
import { NotificationPreferencesPanel } from "@/components/dashboard/NotificationPreferencesPanel";
import { MyReportsPanel } from "@/components/dashboard/MyReportsPanel";
import { formatMonthYear, formatMoney } from "@/lib/format";
import { getMyAccountFn, updateMyAccountNameFn } from "@/server/functions/account";
import { getInstructorEarningsSummaryFn } from "@/server/functions/earnings";
import type { AccountOverviewDTO } from "@/server/dto/account";
import type { InstructorEarningsSummaryDto } from "@/server/dto/earnings";

export const Route = createFileRoute("/instructor/settings")({
  loader: async () => {
    const [account, earnings] = await Promise.all([
      getMyAccountFn(),
      getInstructorEarningsSummaryFn(),
    ]);
    return { account, earnings };
  },
  head: () => ({
    meta: [
      { title: "Instructor settings — Learnora" },
      {
        name: "description",
        content: "Account, payout and notification settings for Learnora instructors.",
      },
      { property: "og:title", content: "Instructor settings — Learnora" },
      { property: "og:description", content: "Manage your Learnora instructor account." },
    ],
  }),
  component: InstructorSettings,
});

function InstructorSettings() {
  const { account: initialAccount, earnings } = Route.useLoaderData();
  const [account, setAccount] = useState<AccountOverviewDTO>(initialAccount);
  const [tab, setTab] = useState("account");

  return (
    <DashboardLayout role="instructor">
      <DashboardHeader title="Settings" description="Manage your account, security and payouts." />

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "account", label: "Account" },
          { id: "security", label: "Security" },
          { id: "payouts", label: "Payouts" },
          { id: "notifications", label: "Notifications" },
          { id: "reports", label: "My reports" },
        ]}
      />

      <div className="mt-8">
        {tab === "account" && <AccountTab account={account} onChange={setAccount} />}
        {tab === "security" && <SecurityPanel />}
        {tab === "payouts" && <PayoutsTab earnings={earnings} />}
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
      </div>
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
          <Input value="Instructor" disabled />
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

/**
 * Phase 13 spec item 21: Learnora's payout provider is simulated, so this
 * tab never collects bank/card/IBAN details (option B from the spec — a
 * clear status panel over real Phase 10 balance/history, rather than a
 * fake payout-method form). The full breakdown and payout requests still
 * live on /instructor/earnings; this is a condensed pointer to it.
 */
function PayoutsTab({ earnings }: { earnings: InstructorEarningsSummaryDto }) {
  return (
    <div className="max-w-2xl space-y-5">
      <div className="rounded-xl bg-panel-2 p-4 text-sm ring-1 ring-line">
        Payouts are simulated for now — Learnora doesn't collect or store real bank account or card
        details. Balances below reflect real, persisted earnings and payout records.
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            Available
          </p>
          <p className="mt-2 font-display text-xl tracking-tight">
            {formatMoney(earnings.availableBalance, earnings.currency)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            Pending payout
          </p>
          <p className="mt-2 font-display text-xl tracking-tight">
            {formatMoney(earnings.pendingPayout, earnings.currency)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            Paid out
          </p>
          <p className="mt-2 font-display text-xl tracking-tight">
            {formatMoney(earnings.paidOut, earnings.currency)}
          </p>
        </Card>
      </div>

      <Card className="p-4 text-sm text-muted-foreground">
        Minimum payout is {formatMoney(earnings.minimumPayout, earnings.currency)}. Revenue share on
        new sales is {earnings.revenueSharePercent}% to you.
      </Card>

      <Link
        to="/instructor/earnings"
        className="inline-block text-sm text-brand-soft hover:underline"
      >
        View full earnings, payout history and request a payout →
      </Link>
    </div>
  );
}
