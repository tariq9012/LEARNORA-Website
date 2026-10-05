import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Bell,
  BookOpen,
  Clock3,
  MessageSquare,
  PlusCircle,
  Star,
  Users,
  Wallet,
} from "lucide-react";
import { DashboardLayout, DashboardHeader } from "@/components/layout/DashboardLayout";
import { Button, Card, DataTable, StatCard, StatusBadge } from "@/components/ui/kit";
import { formatMoney, formatPrice } from "@/lib/format";
import { getInstructorEarningsSummaryFn } from "@/server/functions/earnings";
import { getUnreadCountsFn } from "@/server/functions/notifications";
import {
  getInstructorCoursesFn,
  getMyInstructorApprovalStatusFn,
} from "@/server/functions/instructor-course";
import type { InstructorCourseListItemDTO } from "@/server/dto/instructor-course";

export const Route = createFileRoute("/instructor/dashboard")({
  loader: async () => {
    const [courses, approvalStatus, earnings, unread] = await Promise.all([
      getInstructorCoursesFn(),
      getMyInstructorApprovalStatusFn(),
      getInstructorEarningsSummaryFn(),
      getUnreadCountsFn(),
    ]);
    return { courses, approvalStatus, earnings, unread };
  },
  head: () => ({
    meta: [
      { title: "Instructor dashboard — Learnora" },
      {
        name: "description",
        content: "Track students and course performance as a Learnora instructor.",
      },
      { property: "og:title", content: "Instructor dashboard — Learnora" },
      { property: "og:description", content: "Your teaching overview on Learnora." },
    ],
  }),
  component: InstructorDashboard,
});

const STATUS_LABEL: Record<InstructorCourseListItemDTO["status"], string> = {
  PUBLISHED: "Published",
  PENDING_REVIEW: "Pending Review",
  DRAFT: "Draft",
  REJECTED: "Rejected",
  ARCHIVED: "Archived",
};

function InstructorDashboard() {
  const { courses, approvalStatus, earnings, unread } = Route.useLoaderData();
  const published = courses.filter((c) => c.status === "PUBLISHED");
  const inProgress = courses.filter(
    (c) => c.status === "DRAFT" || c.status === "PENDING_REVIEW",
  ).length;
  const students = courses.reduce((n, c) => n + c.students, 0);
  const rated = published.filter((c) => c.reviewCount > 0);
  const avgRating =
    rated.length > 0 ? (rated.reduce((n, c) => n + c.rating, 0) / rated.length).toFixed(1) : "—";

  return (
    <DashboardLayout role="instructor">
      <DashboardHeader
        title="Instructor dashboard"
        description={`${published.length} published course${published.length === 1 ? "" : "s"}.`}
        action={
          <Link to="/instructor/courses/create">
            <Button>
              <PlusCircle size={15} /> Create course
            </Button>
          </Link>
        }
      />

      {approvalStatus !== "APPROVED" && (
        <Card className="mb-8 flex items-start gap-3 border border-warn/30 bg-warn/5 p-5">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warn" />
          <div>
            <p className="font-medium text-warn">
              {approvalStatus === "REJECTED"
                ? "Instructor application not approved"
                : "Instructor approval pending"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              You can browse your dashboard, but creating and publishing courses is unlocked once an
              admin approves your instructor account.
            </p>
          </div>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total students" value={students.toLocaleString("en-US")} icon={Users} />
        <StatCard label="Published courses" value={published.length} icon={BookOpen} />
        <StatCard
          label="Average rating"
          value={avgRating}
          hint="Across published courses"
          icon={Star}
        />
        <StatCard label="Draft & pending" value={inProgress} hint="Not yet live" icon={Clock3} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Total earned"
          value={formatMoney(earnings.totalEarned, earnings.currency)}
          hint="After refunds"
          icon={Wallet}
        />
        <StatCard
          label="Available balance"
          value={formatMoney(earnings.availableBalance, earnings.currency)}
          hint="Details on the Earnings page"
          icon={Wallet}
        />
        <StatCard
          label="Pending payout"
          value={formatMoney(earnings.pendingPayout, earnings.currency)}
          hint="Awaiting admin"
          icon={Clock3}
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Link to="/instructor/notifications">
          <StatCard label="Unread notifications" value={unread.notifications} icon={Bell} />
        </Link>
        <Link to="/instructor/messages">
          <StatCard label="Unread messages" value={unread.messages} icon={MessageSquare} />
        </Link>
      </div>

      <section className="mt-12">
        {courses.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You haven't created a course yet.{" "}
            <Link to="/instructor/courses/create" className="text-brand-soft hover:underline">
              Start your first course
            </Link>
            .
          </p>
        ) : (
          <DataTable<InstructorCourseListItemDTO>
            caption="Course performance"
            rows={courses}
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
              {
                key: "students",
                header: "Students",
                render: (c) => c.students.toLocaleString("en-US"),
              },
              {
                key: "rating",
                header: "Rating",
                render: (c) => (c.reviewCount > 0 ? `${c.rating.toFixed(1)} ★` : "—"),
              },
              {
                key: "price",
                header: "Price",
                render: (c) => (c.price === 0 ? "Free" : formatPrice(c.price)),
              },
            ]}
          />
        )}
      </section>
    </DashboardLayout>
  );
}
