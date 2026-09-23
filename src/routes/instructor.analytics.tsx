import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout, DashboardHeader } from "@/components/layout/DashboardLayout";
import { Card, ProgressBar, StatCard } from "@/components/ui/kit";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { getCoursesByInstructor } from "@/data/mock";

export const Route = createFileRoute("/instructor/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — Learnora instructor" },
      { name: "description", content: "Enrolment, completion and engagement analytics for your Learnora courses." },
      { property: "og:title", content: "Analytics — Learnora instructor" },
      { property: "og:description", content: "Course performance analytics on Learnora." },
    ],
  }),
  component: InstructorAnalytics,
});

const enrolByWeek = [
  { week: "W1", value: 42 },
  { week: "W2", value: 58 },
  { week: "W3", value: 51 },
  { week: "W4", value: 77 },
  { week: "W5", value: 64 },
  { week: "W6", value: 92 },
  { week: "W7", value: 86 },
  { week: "W8", value: 108 },
];

function InstructorAnalytics() {
  const courses = getCoursesByInstructor("i1");
  const max = Math.max(...enrolByWeek.map((d) => d.value));

  return (
    <DashboardLayout role="instructor">
      <DashboardHeader title="Analytics" description="How students find, start and finish your courses." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Course views" value="42,180" hint="+18% this month" />
        <StatCard label="View to enrol" value="6.4%" hint="+0.7pt" />
        <StatCard label="Average completion" value="58%" />
        <StatCard label="Refund rate" value="1.2%" hint="Below platform average" />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="font-display text-lg tracking-tight">New enrolments</h3>
          <p className="font-mono text-[11px] text-muted-foreground">Last eight weeks</p>
          <div className="mt-6 flex h-44 items-end gap-2 sm:gap-3">
            {enrolByWeek.map((d) => (
              <div key={d.week} className="flex flex-1 flex-col items-center gap-2">
                <span className="font-mono text-[10px] text-muted-foreground">{d.value}</span>
                <div
                  className="w-full rounded-t-md bg-gradient-to-t from-brand/25 to-brand"
                  style={{ height: `${(d.value / max) * 100}%` }}
                  role="img"
                  aria-label={`${d.week}: ${d.value} enrolments`}
                />
                <span className="font-mono text-[10px] text-muted-foreground">{d.week}</span>
              </div>
            ))}
          </div>
        </Card>

        <RevenueChart title="Revenue by month" subtitle="Gross before platform share" />
      </div>

      <Card className="mt-6 p-5">
        <h3 className="font-display text-lg tracking-tight">Completion by course</h3>
        <div className="mt-5 space-y-5">
          {courses.map((c, i) => (
            <div key={c.id}>
              <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                <span className="truncate">{c.title}</span>
                <span className="font-mono text-[11px] text-muted-foreground">{c.students.toLocaleString("en-US")} students</span>
              </div>
              <ProgressBar value={[74, 61, 48, 55, 68, 39][i % 6] ?? 50} />
            </div>
          ))}
        </div>
      </Card>
    </DashboardLayout>
  );
}
