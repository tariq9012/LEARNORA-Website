import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout, DashboardHeader } from "@/components/layout/DashboardLayout";
import { MessagesView } from "@/components/dashboard/MessagesView";

export const Route = createFileRoute("/instructor/messages")({
  head: () => ({
    meta: [
      { title: "Messages — Learnora instructor" },
      { name: "description", content: "Answer student questions about your Learnora courses." },
      { property: "og:title", content: "Messages — Learnora instructor" },
      { property: "og:description", content: "Instructor inbox on Learnora." },
    ],
  }),
  component: InstructorMessages,
});

function InstructorMessages() {
  return (
    <DashboardLayout role="instructor">
      <DashboardHeader title="Messages" description="Questions from students enrolled in your courses." />
      <MessagesView />
    </DashboardLayout>
  );
}
