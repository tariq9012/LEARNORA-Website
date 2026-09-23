import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout, DashboardHeader } from "@/components/layout/DashboardLayout";
import { UserTable } from "@/components/dashboard/UserTable";
import { Card } from "@/components/ui/kit";
import { instructors } from "@/data/mock";

export const Route = createFileRoute("/admin/instructors")({
  head: () => ({
    meta: [
      { title: "Instructors — Learnora admin" },
      { name: "description", content: "Review instructor accounts, ratings and teaching volume on Learnora." },
      { property: "og:title", content: "Instructors — Learnora admin" },
      { property: "og:description", content: "Learnora instructor administration." },
    ],
  }),
  component: AdminInstructors,
});

function AdminInstructors() {
  return (
    <DashboardLayout role="admin">
      <DashboardHeader title="Instructors" description="Accounts, applications and teaching performance." />

      <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {instructors.map((i) => (
          <Card key={i.id} className="p-5">
            <p className="font-display text-lg tracking-tight">{i.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">{i.title}</p>
            <div className="mt-4 grid grid-cols-3 gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <div>
                <p className="text-base text-cream">{i.courses}</p>
                courses
              </div>
              <div>
                <p className="text-base text-cream">{i.students.toLocaleString("en-US")}</p>
                students
              </div>
              <div>
                <p className="text-base text-gold">{i.rating}</p>
                rating
              </div>
            </div>
          </Card>
        ))}
      </div>

      <UserTable role="instructor" />
    </DashboardLayout>
  );
}
