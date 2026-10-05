import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout, DashboardHeader } from "@/components/layout/DashboardLayout";
import {
  Avatar,
  DataTable,
  Pagination,
  ProgressBar,
  SearchBar,
  Select,
  StatusBadge,
} from "@/components/ui/kit";
import { useServerList } from "@/hooks/use-server-list";
import { formatShortDate, initialsOf } from "@/lib/format";
import { getInstructorCoursesFn } from "@/server/functions/instructor-course";
import { getInstructorStudentsFn } from "@/server/functions/instructor-analytics";
import type { InstructorStudentDTO } from "@/server/dto/admin";

export const Route = createFileRoute("/instructor/students")({
  loader: async () => {
    const [list, courses] = await Promise.all([
      getInstructorStudentsFn({ data: {} }),
      getInstructorCoursesFn(),
    ]);
    return { list, courses };
  },
  head: () => ({
    meta: [
      { title: "Students — Learnora instructor" },
      {
        name: "description",
        content: "See who is enrolled in your Learnora courses and how far they have progressed.",
      },
      { property: "og:title", content: "Students — Learnora instructor" },
      { property: "og:description", content: "Your enrolled students on Learnora." },
    ],
  }),
  component: InstructorStudents,
});

const STATUS_LABEL: Record<InstructorStudentDTO["status"], string> = {
  ACTIVE: "Active",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

function InstructorStudents() {
  const { list, courses } = Route.useLoaderData();
  const { data, filters, setFilter, page, setPage, loading, error } = useServerList({
    initial: list,
    initialFilters: { search: "", courseId: "", status: "" },
    fetcher: (p) =>
      getInstructorStudentsFn({
        data: {
          page: p.page,
          ...(p.search && { search: p.search }),
          ...(p.courseId && { courseId: p.courseId }),
          ...(p.status && { status: p.status }),
        },
      }),
  });

  return (
    <DashboardLayout role="instructor">
      <DashboardHeader
        title="Students"
        description="Students enrolled in your courses. Only names and learning progress are shown — never contact or billing details."
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="min-w-64 flex-1">
          <SearchBar
            placeholder="Search by student name"
            value={filters.search}
            onChange={(v) => setFilter("search", v)}
          />
        </div>
        <Select
          value={filters.courseId}
          onChange={(e) => setFilter("courseId", e.target.value)}
          className="w-full sm:w-56"
          aria-label="Filter by course"
        >
          <option value="">All my courses</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </Select>
        <Select
          value={filters.status}
          onChange={(e) => setFilter("status", e.target.value)}
          className="w-full sm:w-40"
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

      <DataTable<InstructorStudentDTO>
        caption="Enrolled students"
        empty={loading ? "Loading…" : "No students match these filters."}
        rows={data.students}
        columns={[
          {
            key: "student",
            header: "Student",
            render: (s) => (
              <div className="flex items-center gap-3">
                <Avatar initials={initialsOf(s.studentName)} src={s.avatarUrl} size="sm" />
                <span className="font-medium">{s.studentName}</span>
              </div>
            ),
          },
          { key: "course", header: "Course", render: (s) => s.courseTitle },
          {
            key: "status",
            header: "Status",
            render: (s) => <StatusBadge status={STATUS_LABEL[s.status]} />,
          },
          { key: "enrolled", header: "Enrolled", render: (s) => formatShortDate(s.enrolledAt) },
          {
            key: "progress",
            header: "Progress",
            render: (s) => (
              <div className="w-32">
                <ProgressBar value={s.progressPercent} label={`${s.progressPercent}%`} />
              </div>
            ),
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
