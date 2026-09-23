import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { DashboardLayout, DashboardHeader } from "@/components/layout/DashboardLayout";
import { Avatar, Badge, Button, Card, FormField, Input, Textarea } from "@/components/ui/kit";
import { getInstructor } from "@/data/mock";

export const Route = createFileRoute("/instructor/profile")({
  head: () => ({
    meta: [
      { title: "Instructor profile — Learnora" },
      { name: "description", content: "Edit the public instructor profile students see on your Learnora courses." },
      { property: "og:title", content: "Instructor profile — Learnora" },
      { property: "og:description", content: "Your public Learnora teaching profile." },
    ],
  }),
  component: InstructorProfile,
});

function InstructorProfile() {
  const me = getInstructor("i1");
  const [saved, setSaved] = useState(false);

  return (
    <DashboardLayout role="instructor">
      <DashboardHeader title="Instructor profile" description="This appears on every course you publish." />

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card className="h-fit p-6 text-center">
          <Avatar initials={me?.initials ?? "EV"} size="xl" className="mx-auto" />
          <h2 className="mt-4 font-display text-xl tracking-tight">{me?.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{me?.title}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Badge tone="brand">{me?.courses} courses</Badge>
            <Badge>{me?.students.toLocaleString("en-US")} students</Badge>
            <Badge>{me?.rating} rating</Badge>
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
            <FormField label="Display name">
              <Input defaultValue={me?.name} />
            </FormField>
            <FormField label="Professional headline">
              <Input defaultValue={me?.title} />
            </FormField>
            <FormField label="Biography" hint="Students read this before enrolling.">
              <Textarea rows={6} defaultValue={me?.bio} />
            </FormField>
            <FormField label="Areas of expertise" hint="Comma separated.">
              <Input defaultValue={me?.expertise.join(", ")} />
            </FormField>
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField label="Website">
                <Input defaultValue="https://elenavasquez.dev" />
              </FormField>
              <FormField label="LinkedIn">
                <Input defaultValue="https://linkedin.com/in/elenavasquez" />
              </FormField>
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
              <Button type="submit">Save profile</Button>
              {saved && <span className="font-mono text-[11px] text-good">Profile saved (demo only)</span>}
            </div>
          </form>
        </Card>
      </div>
    </DashboardLayout>
  );
}
