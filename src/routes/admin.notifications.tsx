import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout, DashboardHeader } from "@/components/layout/DashboardLayout";
import { NotificationList } from "@/components/dashboard/NotificationList";
import { getMyNotificationsFn } from "@/server/functions/notifications";

export const Route = createFileRoute("/admin/notifications")({
  loader: async () => ({ page: await getMyNotificationsFn({ data: {} }) }),
  head: () => ({
    meta: [
      { title: "Notifications — Learnora admin" },
      {
        name: "description",
        content: "Course updates, payments, payouts and replies from Learnora.",
      },
      { property: "og:title", content: "Notifications — Learnora admin" },
      { property: "og:description", content: "Your Learnora notification centre." },
    ],
  }),
  component: AdminNotifications,
});

function AdminNotifications() {
  const { page } = Route.useLoaderData();
  return (
    <DashboardLayout role="admin">
      <DashboardHeader
        title="Notifications"
        description="Everything that happened while you were away."
      />
      <NotificationList initial={page} />
    </DashboardLayout>
  );
}
