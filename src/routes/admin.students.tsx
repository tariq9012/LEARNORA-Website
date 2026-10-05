import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout, DashboardHeader } from "@/components/layout/DashboardLayout";
import {
  Avatar,
  DataTable,
  Pagination,
  SearchBar,
  Select,
  StatCard,
  StatusBadge,
} from "@/components/ui/kit";
import { useServerList } from "@/hooks/use-server-list";
import { compact, formatMoney, formatShortDate, initialsOf } from "@/lib/format";
import { getAdminStudentsFn } from "@/server/functions/admin-operations";
import type { AdminStudentDTO } from "@/server/dto/admin";

export const Route = createFileRoute("/admin/students")({
  loader: async () => ({ list: await getAdminStudentsFn({ data: {} }) }),
  head: () => ({
    meta: [
      { title: "Students — Learnora admin" },
      {
        name: "description",
        content: "Learner accounts, enrolments and certificates across Learnora.",
      },
      { property: "og:title", content: "Students — Learnora admin" },
      { property: "og:description", content: "Learnora student administration." },
    ],
  }),
  component: AdminStudents,
});

const STATUS_LABEL: Record<AdminStudentDTO["status"], string> = {
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  BANNED: "Banned",
};

function AdminStudents() {
  const { list } = Route.useLoaderData();
  const { data, filters, setFilter, page, setPage, loading, error } = useServerList({
    initial: list,
    initialFilters: { search: "", status: "", sort: "newest" },
    fetcher: (p) =>
      getAdminStudentsFn({
        data: {
          page: p.page,
          sort: p.sort as "newest" | "oldest",
          ...(p.search && { search: p.search }),
          ...(p.status && { status: p.status as AdminStudentDTO["status"] }),
        },
      }),
  });

  return (
    <DashboardLayout role="admin">
      <DashboardHeader
        title="Students"
        description="Learner accounts with enrolment, completion, certificate and net-spend figures. Account status is managed on the Users page."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <StatCard label="Students matching filters" value={compact(data.total)} />
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="min-w-64 flex-1">
          <SearchBar
            placeholder="Search by name or email"
            value={filters.search}
            onChange={(v) => setFilter("search", v)}
          />
        </div>
        <Select
          value={filters.status}
          onChange={(e) => setFilter("status", e.target.value)}
          className="w-full sm:w-44"
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="BANNED">Banned</option>
        </Select>
        <Select
          value={filters.sort}
          onChange={(e) => setFilter("sort", e.target.value)}
          className="w-full sm:w-44"
          aria-label="Sort by joined date"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </Select>
      </div>

      {error && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {error}
        </p>
      )}

      <DataTable<AdminStudentDTO>
        caption="Students"
        empty={loading ? "Loading…" : "No students match these filters."}
        rows={data.students}
        columns={[
          {
            key: "name",
            header: "Student",
            render: (s) => (
              <div className="flex items-center gap-3">
                <Avatar initials={initialsOf(s.name)} src={s.avatarUrl} size="sm" />
                <div>
                  <p className="font-medium">{s.name}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">{s.email}</p>
                </div>
              </div>
            ),
          },
          {
            key: "status",
            header: "Status",
            render: (s) => <StatusBadge status={STATUS_LABEL[s.status]} />,
          },
          { key: "joined", header: "Joined", render: (s) => formatShortDate(s.joinedAt) },
          { key: "enrolled", header: "Enrolled", render: (s) => s.enrollmentCount },
          { key: "active", header: "Active", render: (s) => s.activeEnrollments },
          { key: "completed", header: "Completed", render: (s) => s.completedCourses },
          { key: "certs", header: "Certificates", render: (s) => s.certificateCount },
          {
            key: "spend",
            header: "Net spend",
            className: "text-right",
            render: (s) => formatMoney(s.netSpend, s.currency),
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
      <p className="mt-4 text-xs text-muted-foreground">
        Net spend = sum of the student's paid orders at the amount charged; refunded orders are
        excluded. Enrolled counts active + completed enrolments (cancelled/refunded excluded).
      </p>
    </DashboardLayout>
  );
}
