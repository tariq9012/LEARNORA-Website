import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { DashboardLayout, DashboardHeader } from "@/components/layout/DashboardLayout";
import { Button, Card, Checkbox, FormField, Input, Select, Tabs } from "@/components/ui/kit";

export const Route = createFileRoute("/student/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Learnora" },
      { name: "description", content: "Account, notification and billing preferences for your Learnora account." },
      { property: "og:title", content: "Settings — Learnora" },
      { property: "og:description", content: "Manage your Learnora account settings." },
    ],
  }),
  component: StudentSettings,
});

function StudentSettings() {
  const [tab, setTab] = useState("account");
  const [saved, setSaved] = useState(false);

  return (
    <DashboardLayout role="student">
      <DashboardHeader title="Settings" description="Preferences are stored locally in this demo." />

      <Tabs
        active={tab}
        onChange={(id) => {
          setTab(id);
          setSaved(false);
        }}
        tabs={[
          { id: "account", label: "Account" },
          { id: "notifications", label: "Notifications" },
          { id: "billing", label: "Billing" },
        ]}
      />

      <Card className="mt-8 max-w-2xl p-6">
        {tab === "account" && (
          <div className="space-y-5">
            <FormField label="Email address">
              <Input type="email" defaultValue="alex.mercer@example.com" />
            </FormField>
            <FormField label="Language">
              <Select defaultValue="en">
                <option value="en">English</option>
                <option value="pt">Português</option>
                <option value="es">Español</option>
              </Select>
            </FormField>
            <FormField label="Current password">
              <Input type="password" placeholder="••••••••" />
            </FormField>
            <FormField label="New password" hint="At least 8 characters.">
              <Input type="password" placeholder="••••••••" />
            </FormField>
          </div>
        )}

        {tab === "notifications" && (
          <div className="space-y-4">
            {[
              ["New lessons in my courses", true],
              ["Instructor replies", true],
              ["Wishlist price drops", true],
              ["Weekly learning summary", false],
              ["Platform announcements", false],
            ].map(([label, on]) => (
              <label key={String(label)} className="flex items-center gap-3 text-sm">
                <Checkbox defaultChecked={Boolean(on)} />
                {label}
              </label>
            ))}
          </div>
        )}

        {tab === "billing" && (
          <div className="space-y-5">
            <div className="rounded-xl bg-panel-2 p-4 ring-1 ring-line">
              <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Payment method</p>
              <p className="mt-2 text-sm">Visa •••• 4242 — expires 09/28</p>
            </div>
            <FormField label="Billing name">
              <Input defaultValue="Alex Mercer" />
            </FormField>
            <FormField label="Country">
              <Select defaultValue="pt">
                <option value="pt">Portugal</option>
                <option value="uk">United Kingdom</option>
                <option value="us">United States</option>
              </Select>
            </FormField>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-5">
          <Button onClick={() => setSaved(true)}>Save preferences</Button>
          {saved && <span className="font-mono text-[11px] text-good">Saved (demo only)</span>}
        </div>
      </Card>

      <Card className="mt-6 max-w-2xl border-destructive/30 p-6">
        <h2 className="font-display text-lg tracking-tight">Delete account</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Removes your enrolments, progress and certificates. Disabled in this demo.
        </p>
        <Button variant="destructive" className="mt-4" disabled>
          Delete account
        </Button>
      </Card>
    </DashboardLayout>
  );
}
