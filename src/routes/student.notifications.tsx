import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout, DashboardHeader } from "@/components/layout/DashboardLayout";
import { NotificationList } from "@/components/dashboard/NotificationList";
import { getMyNotificationsFn } from "@/server/functions/notifications";

export const Route = createFileRoute("/student/notifications")({
  loader: async () => ({ page: await getMyNotificationsFn({ data: {} }) }),
  head: () => ({
    meta: [
      { title: "Notifications — Learnora" },
      {
        name: "description",
        content: "Course updates, payments, payouts and replies from Learnora.",
      },
      { property: "og:title", content: "Notifications — Learnora" },
      { property: "og:description", content: "Your Learnora notification centre." },
    ],
  }),
  component: StudentNotifications,
});

function StudentNotifications() {
  const { page } = Route.useLoaderData();
  return (
    <DashboardLayout role="student">
      <DashboardHeader
        title="Notifications"
        description="Everything that happened while you were away."
      />
      <NotificationList initial={page} />
    </DashboardLayout>
  );
}
