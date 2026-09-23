import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { DashboardLayout, DashboardHeader } from "@/components/layout/DashboardLayout";
import { Avatar, DataTable, ProgressBar, SearchBar, Select } from "@/components/ui/kit";
import { getCoursesByInstructor, users, type PlatformUser } from "@/data/mock";

export const Route = createFileRoute("/instructor/students")({
  head: () => ({
    meta: [
      { title: "Students — Learnora instructor" },
      { name: "description", content: "See who is enrolled in your Learnora courses and how far they have progressed." },
      { property: "og:title", content: "Students — Learnora instructor" },
      { property: "og:description", content: "Your enrolled students on Learnora." },
    ],
  }),
  component: InstructorStudents,
});

const progressFor = (id: string) => 20 + (id.charCodeAt(id.length - 1) * 7) % 78;

function InstructorStudents() {
  const courses = getCoursesByInstructor("i1");
  const [q, setQ] = useState("");
  const [course, setCourse] = useState("all");

  const rows = users
    .filter((u) => u.role === "student")
    .filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(q.toLowerCase()));

  const courseFor = (u: PlatformUser) => courses[u.id.charCodeAt(1) % Math.max(courses.length, 1)];
  const shown = course === "all" ? rows : rows.filter((u) => courseFor(u)?.id === course);

  return (
    <DashboardLayout role="instructor">
      <DashboardHeader title="Students" description="Enrolment and progress across all of your courses." />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="min-w-64 flex-1">
          <SearchBar placeholder="Search students by name or email" value={q} onChange={setQ} />
        </div>
        <Select value={course} onChange={(e) => setCourse(e.target.value)} className="w-full sm:w-64">
          <option value="all">All courses</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </Select>
      </div>

      <DataTable<PlatformUser>
        caption="Enrolled students"
        empty="No students match this filter."
        rows={shown}
        columns={[
          {
            key: "name",
            header: "Student",
            render: (u) => (
              <div className="flex items-center gap-3">
                <Avatar initials={u.initials} size="sm" />
                <div>
                  <p className="font-medium">{u.name}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">{u.email}</p>
                </div>
              </div>
            ),
          },
          { key: "course", header: "Course", render: (u) => courseFor(u)?.title ?? "—" },
          {
            key: "progress",
            header: "Progress",
            render: (u) => <ProgressBar value={progressFor(u.id)} className="w-40" />,
          },
          { key: "joined", header: "Enrolled", render: (u) => u.joined },
        ]}
      />
    </DashboardLayout>
  );
}
