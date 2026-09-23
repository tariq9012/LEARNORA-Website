import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, GraduationCap, Users, Wallet } from "lucide-react";
import { DashboardLayout, DashboardHeader } from "@/components/layout/DashboardLayout";
import {
  Button,
  Card,
  DataTable,
  SectionHeading,
  StatCard,
  StatusBadge,
} from "@/components/ui/kit";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { compact, currency, payments, platformStats, type Payment } from "@/data/mock";
import { getModerationCountsFn, getPendingCoursesFn } from "@/server/functions/admin-course";

export const Route = createFileRoute("/admin/dashboard")({
  loader: async () => {
    const [counts, pending] = await Promise.all([getModerationCountsFn(), getPendingCoursesFn()]);
    return { counts, pending };
  },
  head: () => ({
    meta: [
      { title: "Admin dashboard — Learnora" },
      {
        name: "description",
        content: "Platform-wide overview of users, courses, enrolments and revenue on Learnora.",
      },
      { property: "og:title", content: "Admin dashboard — Learnora" },
      { property: "og:description", content: "Learnora platform administration overview." },
    ],
  }),
  component: AdminDashboard,
});

function AdminDashboard() {
  const { counts, pending } = Route.useLoaderData();
  const totalRealCourses = counts.pendingReview + counts.published + counts.rejected;

  return (
    <DashboardLayout role="admin">
      <DashboardHeader
        title="Platform overview"
        description="Course moderation counts below are live; student/instructor/revenue figures are illustrative pending a later phase."
        action={
          <Link to="/admin/reports">
            <Button variant="outline">View reports</Button>
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total students"
          value={compact(platformStats.students)}
          hint="Illustrative"
          icon={GraduationCap}
        />
        <StatCard
          label="Instructors"
          value={platformStats.instructors}
          hint="Illustrative"
          icon={Users}
        />
        <StatCard
          label="Courses"
          value={totalRealCourses}
          hint={`${counts.pendingReview} awaiting review`}
          icon={BookOpen}
        />
        <StatCard
          label="Revenue (lifetime)"
          value={currency(platformStats.revenue)}
          hint="Illustrative"
          icon={Wallet}
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_340px]">
        <RevenueChart
          title="Platform revenue"
          subtitle="Illustrative — real payments are a later phase"
        />
        <Card className="p-5">
          <h3 className="font-display text-lg tracking-tight">Awaiting approval</h3>
          <div className="mt-4 space-y-3">
            {pending.length === 0 && (
              <p className="text-sm text-muted-foreground">Nothing in the queue.</p>
            )}
            {pending.slice(0, 5).map((c) => (
              <div key={c.id} className="rounded-xl bg-panel-2 p-3 ring-1 ring-line">
                <p className="text-sm font-medium">{c.title}</p>
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                  {c.instructorName}
                </p>
              </div>
            ))}
          </div>
          <Link to="/admin/course-approval" className="mt-4 block">
            <Button variant="outline" block size="sm">
              Open approval queue
            </Button>
          </Link>
        </Card>
      </div>

      <section className="mt-12">
        <SectionHeading
          eyebrow="Payments"
          title="Latest transactions"
          action={
            <Link to="/admin/payments" className="text-sm text-muted-foreground hover:text-cream">
              All payments →
            </Link>
          }
          className="mb-6"
        />
        <DataTable<Payment>
          caption="Latest transactions"
          rows={payments}
          columns={[
            {
              key: "id",
              header: "Transaction",
              render: (p) => <span className="font-mono text-xs">{p.id}</span>,
            },
            { key: "student", header: "Student", render: (p) => p.student },
            { key: "course", header: "Course", render: (p) => p.course },
            { key: "date", header: "Date", render: (p) => p.date },
            { key: "status", header: "Status", render: (p) => <StatusBadge status={p.status} /> },
            {
              key: "amount",
              header: "Amount",
              className: "text-right",
              render: (p) => currency(p.amount),
            },
          ]}
        />
      </section>
    </DashboardLayout>
  );
}
