import { createFileRoute, Link } from "@tanstack/react-router";
import { DashboardLayout, DashboardHeader } from "@/components/layout/DashboardLayout";
import { Button, DataTable, Pagination, SearchBar, Select, StatusBadge } from "@/components/ui/kit";
import { useServerList } from "@/hooks/use-server-list";
import { compact, formatMoney, formatShortDate } from "@/lib/format";
import { getAdminCoursesFn, getCategoryOptionsFn } from "@/server/functions/admin-operations";
import type { AdminCourseListItemDTO } from "@/server/dto/admin";

export const Route = createFileRoute("/admin/courses")({
  loader: async () => {
    const [list, categories] = await Promise.all([
      getAdminCoursesFn({ data: {} }),
      getCategoryOptionsFn(),
    ]);
    return { list, categories };
  },
  head: () => ({
    meta: [
      { title: "Courses — Learnora admin" },
      {
        name: "description",
        content: "Every course on Learnora with status, pricing and enrolment volume.",
      },
      { property: "og:title", content: "Courses — Learnora admin" },
      { property: "og:description", content: "Learnora course catalogue administration." },
    ],
  }),
  component: AdminCourses,
});

const STATUS_LABEL: Record<AdminCourseListItemDTO["status"], string> = {
  DRAFT: "Draft",
  PENDING_REVIEW: "Pending Review",
  PUBLISHED: "Published",
  REJECTED: "Rejected",
  ARCHIVED: "Archived",
};

type Filters = { search: string; status: string; categoryId: string };

function AdminCourses() {
  const { list, categories } = Route.useLoaderData();

  const { data, filters, setFilter, page, setPage, loading, error } = useServerList({
    initial: list,
    initialFilters: { search: "", status: "", categoryId: "" } as Filters,
    fetcher: (p) =>
      getAdminCoursesFn({
        data: {
          page: p.page,
          ...(p.search && { search: p.search }),
          ...(p.status && { status: p.status }),
          ...(p.categoryId && { categoryId: p.categoryId }),
        },
      }),
  });

  return (
    <DashboardLayout role="admin">
      <DashboardHeader
        title="Courses"
        description="The full catalogue, including drafts and rejected submissions. Pending courses are reviewed in the approval queue."
        action={
          <Link to="/admin/course-approval">
            <Button variant="outline">Approval queue</Button>
          </Link>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="min-w-64 flex-1">
          <SearchBar
            placeholder="Search courses or instructors"
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
        <Select
          value={filters.categoryId}
          onChange={(e) => setFilter("categoryId", e.target.value)}
          className="w-full sm:w-48"
          aria-label="Filter by category"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      <DataTable<AdminCourseListItemDTO>
        caption="All courses"
        empty={loading ? "Loading…" : "No courses match these filters."}
        rows={data.courses}
        columns={[
          {
            key: "title",
            header: "Course",
            render: (c) => (
              <div>
                <p className="font-medium">{c.title}</p>
                <p className="font-mono text-[10px] text-muted-foreground">
                  {c.categoryName ?? "Uncategorised"} · created {formatShortDate(c.createdAt)}
                </p>
              </div>
            ),
          },
          { key: "instructor", header: "Instructor", render: (c) => c.instructorName },
          {
            key: "status",
            header: "Status",
            render: (c) => <StatusBadge status={STATUS_LABEL[c.status]} />,
          },
          { key: "students", header: "Students", render: (c) => compact(c.enrollmentCount) },
          {
            key: "rating",
            header: "Rating",
            render: (c) =>
              c.averageRating != null ? `${c.averageRating} (${c.reviewCount})` : "—",
          },
          {
            key: "price",
            header: "Price",
            render: (c) => (c.price === 0 ? "Free" : formatMoney(c.price, c.currency)),
          },
          {
            key: "actions",
            header: "",
            className: "text-right",
            render: (c) =>
              c.status === "PENDING_REVIEW" ? (
                <Link to="/admin/course-approval">
                  <Button variant="outline" size="sm">
                    Review
                  </Button>
                </Link>
              ) : c.status === "PUBLISHED" ? (
                <Link to="/courses/$courseId" params={{ courseId: c.slug }}>
                  <Button variant="ghost" size="sm">
                    View
                  </Button>
                </Link>
              ) : null,
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
