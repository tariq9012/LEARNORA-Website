import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout, DashboardHeader } from "@/components/layout/DashboardLayout";
import { UserTable } from "@/components/dashboard/UserTable";

export const Route = createFileRoute("/admin/users")({
  head: () => ({
    meta: [
      { title: "Users — Learnora admin" },
      { name: "description", content: "Search, review and manage every account on the Learnora platform." },
      { property: "og:title", content: "Users — Learnora admin" },
      { property: "og:description", content: "Learnora user administration." },
    ],
  }),
  component: AdminUsers,
});

function AdminUsers() {
  return (
    <DashboardLayout role="admin">
      <DashboardHeader title="Users" description="Every student, instructor and administrator on Learnora." />
      <UserTable />
    </DashboardLayout>
  );
}
