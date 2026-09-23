import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { DashboardLayout, DashboardHeader } from "@/components/layout/DashboardLayout";
import { DataTable, ProgressBar, SearchBar, StatCard } from "@/components/ui/kit";
import { compact, currency, enrollments, platformStats, type Enrollment } from "@/data/mock";

export const Route = createFileRoute("/admin/enrollments")({
  head: () => ({
    meta: [
      { title: "Enrolments — Learnora admin" },
      { name: "description", content: "Every course enrolment on Learnora with progress and purchase value." },
      { property: "og:title", content: "Enrolments — Learnora admin" },
      { property: "og:description", content: "Learnora enrolment records." },
    ],
  }),
  component: AdminEnrollments,
});

function AdminEnrollments() {
  const [q, setQ] = useState("");
  const rows = enrollments.filter((e) => `${e.title} ${e.student}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <DashboardLayout role="admin">
      <DashboardHeader title="Enrolments" description="Records link a student, a course and a payment." />

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <StatCard label="Total enrolments" value={compact(platformStats.enrollments)} />
        <StatCard label="Average completion" value="54%" />
        <StatCard label="Enrolment value" value={currency(platformStats.revenue)} />
      </div>

      <div className="mb-6 max-w-md">
        <SearchBar placeholder="Search by student or course" value={q} onChange={setQ} />
      </div>

      <DataTable<Enrollment>
        caption="Enrolments"
        empty="No enrolments match this search."
        rows={rows}
        columns={[
          { key: "student", header: "Student", render: (e) => <span className="font-medium">{e.student}</span> },
          { key: "title", header: "Course", render: (e) => e.title },
          { key: "instructor", header: "Instructor", render: (e) => e.instructor },
          { key: "enrolledOn", header: "Enrolled", render: (e) => e.enrolledOn },
          { key: "progress", header: "Progress", render: (e) => <ProgressBar value={e.progress} className="w-36" /> },
          { key: "amount", header: "Paid", className: "text-right", render: (e) => currency(e.amount) },
        ]}
      />
    </DashboardLayout>
  );
}
