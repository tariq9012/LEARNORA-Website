import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout, DashboardHeader } from "@/components/layout/DashboardLayout";
import { Card, DataTable, ProgressBar, StatCard, StatusBadge } from "@/components/ui/kit";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { compact, formatMoney } from "@/lib/format";
import { getInstructorAnalyticsFn } from "@/server/functions/instructor-analytics";
import type { InstructorCoursePerformanceDTO } from "@/server/dto/admin";

export const Route = createFileRoute("/instructor/analytics")({
  loader: async () => ({ analytics: await getInstructorAnalyticsFn() }),
  head: () => ({
    meta: [
      { title: "Analytics — Learnora instructor" },
      {
        name: "description",
        content: "Enrolments, completions, ratings and earnings across your Learnora courses.",
      },
      { property: "og:title", content: "Analytics — Learnora instructor" },
      { property: "og:description", content: "Your Learnora teaching analytics." },
    ],
  }),
  component: InstructorAnalytics,
});

const STATUS_LABEL: Record<InstructorCoursePerformanceDTO["status"], string> = {
  DRAFT: "Draft",
  PENDING_REVIEW: "Pending Review",
  PUBLISHED: "Published",
  REJECTED: "Rejected",
  ARCHIVED: "Archived",
};

function InstructorAnalytics() {
  const { analytics: a } = Route.useLoaderData();
  const maxEnrol = Math.max(1, ...a.enrollmentsByMonth.map((d) => d.value));
  const maxRating = Math.max(1, ...a.ratingDistribution.map((d) => d.count));
  const completionRate =
    a.totalStudents > 0 ? Math.round((a.completions / a.totalStudents) * 100) : 0;

  return (
    <DashboardLayout role="instructor">
      <DashboardHeader
        title="Analytics"
        description="Real numbers from your enrolments, reviews and persisted earnings. Earnings are your net share after the platform's cut, and exclude refunded sales."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Students"
          value={compact(a.totalStudents)}
          hint={`${a.publishedCourses} of ${a.totalCourses} courses published`}
        />
        <StatCard
          label="Completions"
          value={compact(a.completions)}
          hint={`${completionRate}% of students`}
        />
        <StatCard
          label="Average rating"
          value={a.averageRating != null ? a.averageRating.toFixed(1) : "—"}
          hint={`${a.reviewCount} visible reviews`}
        />
        <StatCard
          label="Total earnings"
          value={formatMoney(a.totalEarnings, a.currency)}
          hint="Net, excluding refunded"
        />
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Available to withdraw"
          value={formatMoney(a.availableEarnings, a.currency)}
        />
        <StatCard label="Paid out" value={formatMoney(a.paidEarnings, a.currency)} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="font-display text-lg tracking-tight">New enrolments</h3>
          <p className="font-mono text-[11px] text-muted-foreground">
            Last 6 months · currently entitled students
          </p>
          <div className="mt-6 flex h-44 items-end gap-2 sm:gap-3">
            {a.enrollmentsByMonth.map((d) => (
              <div key={d.month} className="flex flex-1 flex-col items-center gap-2">
                <span className="font-mono text-[10px] text-muted-foreground">{d.value}</span>
                <div
                  className="w-full rounded-t-md bg-gradient-to-t from-brand/25 to-brand"
                  style={{ height: `${d.value === 0 ? 2 : (d.value / maxEnrol) * 100}%` }}
                  role="img"
                  aria-label={`${d.month}: ${d.value} enrolments`}
                />
                <span className="font-mono text-[10px] text-muted-foreground">{d.month}</span>
              </div>
            ))}
          </div>
        </Card>

        <RevenueChart
          title="Earnings by month"
          subtitle="Last 6 months · your net share"
          data={a.earningsByMonth}
        />
      </div>

      <Card className="mt-6 p-5">
        <h3 className="font-display text-lg tracking-tight">Rating distribution</h3>
        <div className="mt-5 space-y-3">
          {a.ratingDistribution.map((d) => (
            <div key={d.rating} className="flex items-center gap-3 text-sm">
              <span className="w-12 font-mono text-[11px] text-muted-foreground">
                {d.rating} stars
              </span>
              <div className="flex-1">
                <ProgressBar value={(d.count / maxRating) * 100} />
              </div>
              <span className="w-8 text-right font-mono text-[11px] text-muted-foreground">
                {d.count}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <section className="mt-6">
        <h3 className="mb-4 font-display text-lg tracking-tight">Course performance</h3>
        <DataTable<InstructorCoursePerformanceDTO & { id: string }>
          caption="Course performance"
          empty="You haven't created any courses yet."
          rows={a.courses.map((c) => ({ ...c, id: c.courseId }))}
          columns={[
            {
              key: "title",
              header: "Course",
              render: (c) => <span className="font-medium">{c.title}</span>,
            },
            {
              key: "status",
              header: "Status",
              render: (c) => <StatusBadge status={STATUS_LABEL[c.status]} />,
            },
            { key: "enrollments", header: "Students", render: (c) => compact(c.enrollments) },
            { key: "completions", header: "Completions", render: (c) => compact(c.completions) },
            {
              key: "rating",
              header: "Rating",
              render: (c) =>
                c.averageRating != null ? `${c.averageRating} (${c.reviewCount})` : "—",
            },
            {
              key: "earnings",
              header: "Earnings",
              className: "text-right",
              render: (c) => formatMoney(c.earnings, a.currency),
            },
          ]}
        />
      </section>
    </DashboardLayout>
  );
}
