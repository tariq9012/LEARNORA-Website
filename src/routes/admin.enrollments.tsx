import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout, DashboardHeader } from "@/components/layout/DashboardLayout";
import {
  DataTable,
  Pagination,
  SearchBar,
  Select,
  StatCard,
  StatusBadge,
} from "@/components/ui/kit";
import { useServerList } from "@/hooks/use-server-list";
import { compact, formatShortDate } from "@/lib/format";
import { getAdminEnrollmentsFn } from "@/server/functions/admin-operations";
import type { AdminEnrollmentDTO } from "@/server/dto/admin";

export const Route = createFileRoute("/admin/enrollments")({
  loader: async () => ({ list: await getAdminEnrollmentsFn({ data: {} }) }),
  head: () => ({
    meta: [
      { title: "Enrolments — Learnora admin" },
      {
        name: "description",
        content: "Every student enrolment on Learnora with progress and status.",
      },
      { property: "og:title", content: "Enrolments — Learnora admin" },
      { property: "og:description", content: "Learnora enrolment administration." },
    ],
  }),
  component: AdminEnrollments,
});

const STATUS_LABEL: Record<AdminEnrollmentDTO["status"], string> = {
  ACTIVE: "Active",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

function AdminEnrollments() {
  const { list } = Route.useLoaderData();
  const { data, filters, setFilter, page, setPage, loading, error } = useServerList({
    initial: list,
    initialFilters: { search: "", status: "" },
    fetcher: (p) =>
      getAdminEnrollmentsFn({
        data: {
          page: p.page,
          ...(p.search && { search: p.search }),
          ...(p.status && { status: p.status }),
        },
      }),
  });

  return (
    <DashboardLayout role="admin">
      <DashboardHeader
        title="Enrolments"
        description="Read-only view of who is enrolled where. Cancellations happen through refunds on the payments page."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <StatCard label="Enrolments matching filters" value={compact(data.total)} />
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="min-w-64 flex-1">
          <SearchBar
            placeholder="Search by student or course title"
            value={filters.search}
            onChange={(v) => setFilter("search", v)}
          />
        </div>
        <Select
          value={filters.status}
          onChange={(e) => setFilter("status", e.target.value)}
          className="w-full sm:w-48"
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      <DataTable<AdminEnrollmentDTO>
        caption="Enrolments"
        empty={loading ? "Loading…" : "No enrolments match these filters."}
        rows={data.enrollments}
        columns={[
          { key: "student", header: "Student", render: (e) => e.studentName },
          {
            key: "course",
            header: "Course",
            render: (e) => (
              <div>
                <p className="font-medium">{e.courseTitle}</p>
                <p className="font-mono text-[10px] text-muted-foreground">{e.instructorName}</p>
              </div>
            ),
          },
          {
            key: "status",
            header: "Status",
            render: (e) => <StatusBadge status={STATUS_LABEL[e.status]} />,
          },
          { key: "enrolled", header: "Enrolled", render: (e) => formatShortDate(e.enrolledAt) },
          {
            key: "progress",
            header: "Progress",
            render: (e) => (
              <div className="w-28">
                <div className="h-1.5 overflow-hidden rounded-full bg-panel-2 ring-1 ring-line">
                  <div className="h-full bg-brand" style={{ width: `${e.progressPercent}%` }} />
                </div>
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                  {e.progressPercent}%
                </p>
              </div>
            ),
          },
          {
            key: "completed",
            header: "Completed",
            render: (e) => (e.completedAt ? formatShortDate(e.completedAt) : "—"),
          },
        ]}
      />
      <Pagination
        page={page}
        pageSize={data.pageSize}
        total={data.total}
        onChange={setPage}
        disabled={loading}
      />
    </DashboardLayout>
  );
}
