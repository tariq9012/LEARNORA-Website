import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { DashboardLayout, DashboardHeader } from "@/components/layout/DashboardLayout";
import { Avatar, Badge, Button, Card, FormField, Input, Textarea } from "@/components/ui/kit";

export const Route = createFileRoute("/student/profile")({
  head: () => ({
    meta: [
      { title: "Profile — Learnora" },
      { name: "description", content: "Manage your Learnora public profile, headline and interests." },
      { property: "og:title", content: "Profile — Learnora" },
      { property: "og:description", content: "Your Learnora learner profile." },
    ],
  }),
  component: StudentProfile,
});

function StudentProfile() {
  const [saved, setSaved] = useState(false);

  return (
    <DashboardLayout role="student">
      <DashboardHeader title="Profile" description="This is what instructors see when you post a question." />

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card className="h-fit p-6 text-center">
          <Avatar initials="AM" size="xl" className="mx-auto" />
          <h2 className="mt-4 font-display text-xl tracking-tight">Alex Mercer</h2>
          <p className="mt-1 text-sm text-muted-foreground">Front-end developer, Lisbon</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Badge tone="brand">6 courses</Badge>
            <Badge>2 certificates</Badge>
          </div>
          <Button variant="outline" block className="mt-6">
            Change photo
          </Button>
        </Card>

        <Card className="p-6">
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              setSaved(true);
            }}
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField label="First name">
                <Input defaultValue="Alex" />
              </FormField>
              <FormField label="Last name">
                <Input defaultValue="Mercer" />
              </FormField>
            </div>
            <FormField label="Email address">
              <Input type="email" defaultValue="alex.mercer@example.com" />
            </FormField>
            <FormField label="Headline" hint="Shown next to your questions and reviews.">
              <Input defaultValue="Front-end developer learning systems design" />
            </FormField>
            <FormField label="About you">
              <Textarea
                rows={5}
                defaultValue="Building interfaces for a small product team. Currently working through React performance and design systems, with statistics on the side."
              />
            </FormField>
            <FormField label="Website">
              <Input defaultValue="https://alexmercer.dev" />
            </FormField>

            <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
              <Button type="submit">Save changes</Button>
              <Button type="button" variant="ghost" onClick={() => setSaved(false)}>
                Cancel
              </Button>
              {saved && <span className="font-mono text-[11px] text-good">Profile saved (demo only)</span>}
            </div>
          </form>
        </Card>
      </div>
    </DashboardLayout>
  );
}
