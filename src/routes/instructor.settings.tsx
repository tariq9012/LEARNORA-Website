import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { DashboardLayout, DashboardHeader } from "@/components/layout/DashboardLayout";
import { Button, Card, Checkbox, FormField, Input, Select, Tabs } from "@/components/ui/kit";

export const Route = createFileRoute("/instructor/settings")({
  head: () => ({
    meta: [
      { title: "Instructor settings — Learnora" },
      { name: "description", content: "Account, payout and notification settings for Learnora instructors." },
      { property: "og:title", content: "Instructor settings — Learnora" },
      { property: "og:description", content: "Manage your Learnora instructor account." },
    ],
  }),
  component: InstructorSettings,
});

function InstructorSettings() {
  const [tab, setTab] = useState("account");
  const [saved, setSaved] = useState(false);

  return (
    <DashboardLayout role="instructor">
      <DashboardHeader title="Settings" description="Preferences are local to this preview." />

      <Tabs
        active={tab}
        onChange={(id) => {
          setTab(id);
          setSaved(false);
        }}
        tabs={[
          { id: "account", label: "Account" },
          { id: "payouts", label: "Payouts" },
          { id: "notifications", label: "Notifications" },
        ]}
      />

      <Card className="mt-8 max-w-2xl p-6">
        {tab === "account" && (
          <div className="space-y-5">
            <FormField label="Email address">
              <Input type="email" defaultValue="elena.vasquez@example.com" />
            </FormField>
            <FormField label="Teaching language">
              <Select defaultValue="en">
                <option value="en">English</option>
                <option value="es">Español</option>
              </Select>
            </FormField>
            <FormField label="New password" hint="At least 8 characters.">
              <Input type="password" placeholder="••••••••" />
            </FormField>
          </div>
        )}

        {tab === "payouts" && (
          <div className="space-y-5">
            <FormField label="Payout method">
              <Select defaultValue="bank">
                <option value="bank">Bank transfer</option>
                <option value="paypal">PayPal</option>
              </Select>
            </FormField>
            <FormField label="Account holder">
              <Input defaultValue="Elena Vasquez" />
            </FormField>
            <FormField label="IBAN">
              <Input defaultValue="PT50 •••• •••• •••• 6612" />
            </FormField>
            <FormField label="Minimum payout">
              <Select defaultValue="50">
                <option value="50">$50</option>
                <option value="250">$250</option>
                <option value="1000">$1,000</option>
              </Select>
            </FormField>
          </div>
        )}

        {tab === "notifications" && (
          <div className="space-y-4">
            {[
              ["New student questions", true],
              ["New reviews on my courses", true],
              ["Course approval updates", true],
              ["Monthly earnings summary", true],
              ["Platform news for instructors", false],
            ].map(([label, on]) => (
              <label key={String(label)} className="flex items-center gap-3 text-sm">
                <Checkbox defaultChecked={Boolean(on)} />
                {label}
              </label>
            ))}
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-5">
          <Button onClick={() => setSaved(true)}>Save settings</Button>
          {saved && <span className="font-mono text-[11px] text-good">Saved (demo only)</span>}
        </div>
      </Card>
    </DashboardLayout>
  );
}
