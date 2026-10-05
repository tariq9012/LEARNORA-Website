import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DashboardLayout, DashboardHeader } from "@/components/layout/DashboardLayout";
import { MessagesView } from "@/components/dashboard/MessagesView";
import { getMyConversationsFn } from "@/server/functions/messaging";

export const Route = createFileRoute("/instructor/messages")({
  // ?c=<conversationId> deep-links a conversation (used by notification links).
  validateSearch: (search: Record<string, unknown>): { c?: string } =>
    typeof search["c"] === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(search["c"])
      ? { c: search["c"] }
      : {},
  loader: async () => ({ list: await getMyConversationsFn({ data: {} }) }),
  head: () => ({
    meta: [
      { title: "Messages — Learnora instructor" },
      { name: "description", content: "Answer student questions about your Learnora courses." },
      { property: "og:title", content: "Messages — Learnora instructor" },
      { property: "og:description", content: "Your Learnora conversations." },
    ],
  }),
  component: InstructorMessages,
});

function InstructorMessages() {
  const { list } = Route.useLoaderData();
  const { c } = Route.useSearch();
  const navigate = useNavigate();

  return (
    <DashboardLayout role="instructor">
      <DashboardHeader
        title="Messages"
        description="Questions from students enrolled in your courses."
      />
      <MessagesView
        initial={list}
        activeId={c ?? null}
        onSelect={(id) =>
          void navigate({ to: "/instructor/messages", search: id ? { c: id } : {}, replace: true })
        }
        emptyHint="No conversations yet. Students enrolled in your courses can message you from their course page."
      />
    </DashboardLayout>
  );
}
