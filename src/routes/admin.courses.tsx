import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { DashboardLayout, DashboardHeader } from "@/components/layout/DashboardLayout";
import { Button, DataTable, SearchBar, Select, StatusBadge } from "@/components/ui/kit";
import { compact, courses, currency, type Course } from "@/data/mock";

export const Route = createFileRoute("/admin/courses")({
  head: () => ({
    meta: [
      { title: "Courses — Learnora admin" },
      { name: "description", content: "Every course on Learnora with status, pricing and enrolment volume." },
      { property: "og:title", content: "Courses — Learnora admin" },
      { property: "og:description", content: "Learnora course catalogue administration." },
    ],
  }),
  component: AdminCourses,
});

function AdminCourses() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");

  const rows = courses
    .filter((c) => (status === "all" ? true : c.status === status))
    .filter((c) => `${c.title} ${c.instructor}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <DashboardLayout role="admin">
      <DashboardHeader title="Courses" description="The full catalogue, including drafts and rejected submissions." />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="min-w-64 flex-1">
          <SearchBar placeholder="Search courses or instructors" value={q} onChange={setQ} />
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full sm:w-56">
          <option value="all">All statuses</option>
          <option value="Published">Published</option>
          <option value="Pending Review">Pending Review</option>
          <option value="Draft">Draft</option>
          <option value="Rejected">Rejected</option>
        </Select>
      </div>

      <DataTable<Course>
        caption="All courses"
        empty="No courses match this filter."
        rows={rows}
        columns={[
          {
            key: "title",
            header: "Course",
            render: (c) => (
              <div>
                <p className="font-medium">{c.title}</p>
                <p className="font-mono text-[10px] text-muted-foreground">{c.category}</p>
              </div>
            ),
          },
          { key: "instructor", header: "Instructor", render: (c) => c.instructor },
          { key: "status", header: "Status", render: (c) => <StatusBadge status={c.status} /> },
          { key: "students", header: "Students", render: (c) => compact(c.students) },
          { key: "price", header: "Price", render: (c) => (c.price === 0 ? "Free" : currency(c.price)) },
          { key: "revenue", header: "Revenue", render: (c) => currency(c.revenue) },
          {
            key: "actions",
            header: "",
            className: "text-right",
            render: (c) => (
              <Link to="/courses/$courseId" params={{ courseId: c.id }}>
                <Button variant="ghost" size="sm">
                  View
                </Button>
              </Link>
            ),
          },
        ]}
      />
    </DashboardLayout>
  );
}
