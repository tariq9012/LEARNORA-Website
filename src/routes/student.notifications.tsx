import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout, DashboardHeader } from "@/components/layout/DashboardLayout";
import { NotificationList } from "@/components/dashboard/NotificationList";

export const Route = createFileRoute("/student/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — Learnora" },
      { name: "description", content: "Course updates, replies and achievements from Learnora." },
      { property: "og:title", content: "Notifications — Learnora" },
      { property: "og:description", content: "Your Learnora notification centre." },
    ],
  }),
  component: StudentNotifications,
});

function StudentNotifications() {
  return (
    <DashboardLayout role="student">
      <DashboardHeader title="Notifications" description="Everything that happened while you were away." />
      <NotificationList />
    </DashboardLayout>
  );
}
