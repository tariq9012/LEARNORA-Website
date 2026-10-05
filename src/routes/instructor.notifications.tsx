import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout, DashboardHeader } from "@/components/layout/DashboardLayout";
import { NotificationList } from "@/components/dashboard/NotificationList";
import { getMyNotificationsFn } from "@/server/functions/notifications";

export const Route = createFileRoute("/instructor/notifications")({
  loader: async () => ({ page: await getMyNotificationsFn({ data: {} }) }),
  head: () => ({
    meta: [
      { title: "Notifications — Learnora instructor" },
      {
        name: "description",
        content: "Course updates, payments, payouts and replies from Learnora.",
      },
      { property: "og:title", content: "Notifications — Learnora instructor" },
      { property: "og:description", content: "Your Learnora notification centre." },
    ],
  }),
  component: InstructorNotifications,
});

function InstructorNotifications() {
  const { page } = Route.useLoaderData();
  return (
    <DashboardLayout role="instructor">
      <DashboardHeader
        title="Notifications"
        description="Everything that happened while you were away."
      />
      <NotificationList initial={page} />
    </DashboardLayout>
  );
}
