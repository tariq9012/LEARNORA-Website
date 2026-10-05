import { createFileRoute, Link } from "@tanstack/react-router";
import { Banknote, BookOpen, GraduationCap, ShieldCheck, Undo2, Users, Wallet } from "lucide-react";
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
import { compact, formatMoney, formatShortDate } from "@/lib/format";
import { getAdminDashboardFn, getAdminRecentPaymentsFn } from "@/server/functions/admin-dashboard";
import { getAdminFinanceStatsFn } from "@/server/functions/admin-finance";
import type { AdminRecentPaymentDTO } from "@/server/dto/admin";

export const Route = createFileRoute("/admin/dashboard")({
  loader: async () => {
    const [dashboard, recentPayments, finance] = await Promise.all([
      getAdminDashboardFn(),
      getAdminRecentPaymentsFn(),
      getAdminFinanceStatsFn(),
    ]);
    return { dashboard, recentPayments, finance };
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

const STATUS_LABEL: Record<AdminRecentPaymentDTO["status"], string> = {
  PENDING: "Pending",
  PAID: "Paid",
  FAILED: "Failed",
  REFUNDED: "Refunded",
  PARTIALLY_REFUNDED: "Partially refunded",
};

function AdminDashboard() {
  const { dashboard, recentPayments, finance } = Route.useLoaderData();

  return (
    <DashboardLayout role="admin">
      <DashboardHeader
        title="Platform overview"
        description="Every figure below comes straight from the database — nothing here is illustrative."
        action={
          <Link to="/admin/reports">
            <Button variant="outline">View reports</Button>
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active students"
          value={compact(dashboard.activeStudents)}
          hint={`${compact(dashboard.totalUsers)} total accounts`}
          icon={GraduationCap}
        />
        <StatCard
          label="Instructors"
          value={compact(dashboard.instructors)}
          hint={
            dashboard.pendingInstructorApprovals > 0
              ? `${dashboard.pendingInstructorApprovals} pending approval`
              : "All reviewed"
          }
          icon={Users}
        />
        <StatCard
          label="Courses"
          value={compact(dashboard.totalCourses)}
          hint={`${dashboard.publishedCourses} published · ${dashboard.pendingCourseReviews} awaiting review`}
          icon={BookOpen}
        />
        <StatCard
          label="Platform revenue"
          value={formatMoney(dashboard.platformRevenue, dashboard.currency)}
          hint={`${dashboard.paidPayments} paid orders, net of refunds`}
          icon={Wallet}
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active enrollments"
          value={compact(dashboard.activeEnrollments)}
          hint="Currently entitled"
          icon={ShieldCheck}
        />
        <StatCard
          label="Completed enrollments"
          value={compact(dashboard.completedEnrollments)}
          hint="Finished a course"
          icon={GraduationCap}
        />
        <StatCard
          label="Pending payouts"
          value={finance.pendingPayoutCount}
          hint={`${formatMoney(finance.pendingPayoutAmount, finance.currency)} awaiting`}
          icon={Banknote}
        />
        <StatCard
          label="Refunds"
          value={dashboard.processedRefunds}
          hint={`${formatMoney(dashboard.refundedAmount, dashboard.currency)} refunded`}
          icon={Undo2}
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_340px]">
        <RevenueChart
          title="Platform revenue"
          subtitle="Last 6 months · PAID payments, net of refunds"
          data={dashboard.revenueByMonth}
        />
        <Card className="p-5">
          <h3 className="font-display text-lg tracking-tight">Awaiting approval</h3>
          <div className="mt-4 space-y-3">
            {dashboard.pendingCourses.length === 0 && (
              <p className="text-sm text-muted-foreground">Nothing in the queue.</p>
            )}
            {dashboard.pendingCourses.map((c) => (
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
        <DataTable<AdminRecentPaymentDTO>
          caption="Latest transactions"
          rows={recentPayments}
          columns={[
            {
              key: "orderNumber",
              header: "Transaction",
              render: (p) => <span className="font-mono text-xs">{p.orderNumber}</span>,
            },
            { key: "student", header: "Student", render: (p) => p.studentName },
            { key: "course", header: "Course", render: (p) => p.courseTitle },
            { key: "date", header: "Date", render: (p) => formatShortDate(p.createdAt) },
            {
              key: "status",
              header: "Status",
              render: (p) => <StatusBadge status={STATUS_LABEL[p.status]} />,
            },
            {
              key: "amount",
              header: "Amount",
              className: "text-right",
              render: (p) => formatMoney(p.amount, p.currency),
            },
          ]}
        />
      </section>
    </DashboardLayout>
  );
}
