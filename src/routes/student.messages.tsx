import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DashboardLayout, DashboardHeader } from "@/components/layout/DashboardLayout";
import { MessagesView } from "@/components/dashboard/MessagesView";
import { getMyConversationsFn } from "@/server/functions/messaging";

export const Route = createFileRoute("/student/messages")({
  // ?c=<conversationId> deep-links a conversation (used by notification links).
  validateSearch: (search: Record<string, unknown>): { c?: string } =>
    typeof search["c"] === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(search["c"])
      ? { c: search["c"] }
      : {},
  loader: async () => ({ list: await getMyConversationsFn({ data: {} }) }),
  head: () => ({
    meta: [
      { title: "Messages — Learnora" },
      { name: "description", content: "Conversations with your instructors." },
      { property: "og:title", content: "Messages — Learnora" },
      { property: "og:description", content: "Your Learnora conversations." },
    ],
  }),
  component: StudentMessages,
});

function StudentMessages() {
  const { list } = Route.useLoaderData();
  const { c } = Route.useSearch();
  const navigate = useNavigate();

  return (
    <DashboardLayout role="student">
      <DashboardHeader
        title="Messages"
        description="Ask your instructors questions directly from the course you are taking."
      />
      <MessagesView
        initial={list}
        activeId={c ?? null}
        onSelect={(id) =>
          void navigate({ to: "/student/messages", search: id ? { c: id } : {}, replace: true })
        }
        emptyHint="No conversations yet. Open one of your courses and choose “Message instructor” to ask a question."
      />
    </DashboardLayout>
  );
}
