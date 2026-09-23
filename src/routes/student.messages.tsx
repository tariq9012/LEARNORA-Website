import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout, DashboardHeader } from "@/components/layout/DashboardLayout";
import { MessagesView } from "@/components/dashboard/MessagesView";

export const Route = createFileRoute("/student/messages")({
  head: () => ({
    meta: [
      { title: "Messages — Learnora" },
      { name: "description", content: "Conversations with your instructors and the Learnora team." },
      { property: "og:title", content: "Messages — Learnora" },
      { property: "og:description", content: "Your Learnora conversations." },
    ],
  }),
  component: StudentMessages,
});

function StudentMessages() {
  return (
    <DashboardLayout role="student">
      <DashboardHeader title="Messages" description="Ask your instructors questions directly from the course you are taking." />
      <MessagesView />
    </DashboardLayout>
  );
}
