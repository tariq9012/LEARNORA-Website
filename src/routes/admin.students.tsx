import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout, DashboardHeader } from "@/components/layout/DashboardLayout";
import { UserTable } from "@/components/dashboard/UserTable";

export const Route = createFileRoute("/admin/students")({
  head: () => ({
    meta: [
      { title: "Students — Learnora admin" },
      { name: "description", content: "Manage learner accounts and enrolments across Learnora." },
      { property: "og:title", content: "Students — Learnora admin" },
      { property: "og:description", content: "Learnora student administration." },
    ],
  }),
  component: AdminStudents,
});

function AdminStudents() {
  return (
    <DashboardLayout role="admin">
      <DashboardHeader title="Students" description="Learner accounts, enrolment counts and status." />
      <UserTable role="student" />
    </DashboardLayout>
  );
}
