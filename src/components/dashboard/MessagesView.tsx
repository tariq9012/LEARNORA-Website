import { useState } from "react";
import { Send } from "lucide-react";
import { Avatar, Badge, Button, Card, Input } from "@/components/ui/kit";
import { conversations as seed } from "@/data/mock";

export function MessagesView() {
  const [activeId, setActiveId] = useState(seed[0]?.id ?? "");
  const [threads, setThreads] = useState(seed);
  const [draft, setDraft] = useState("");
  const active = threads.find((t) => t.id === activeId);

  const send = () => {
    if (!draft.trim() || !active) return;
    setThreads((prev) =>
      prev.map((t) =>
        t.id === active.id
          ? {
              ...t,
              preview: draft,
              time: "Now",
              messages: [...t.messages, { id: `m${t.messages.length + 1}`, from: "me" as const, body: draft, time: "Now" }],
            }
          : t,
      ),
    );
    setDraft("");
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <Card className="max-h-[70vh] divide-y divide-line overflow-y-auto">
        {threads.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveId(t.id)}
            className={`flex w-full gap-3 p-4 text-left transition-colors ${
              t.id === activeId ? "bg-brand/10" : "hover:bg-panel-2"
            }`}
          >
            <Avatar initials={t.initials} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{t.name}</span>
                <span className="font-mono text-[10px] text-muted-foreground">{t.time}</span>
              </span>
              <span className="mt-0.5 block truncate font-mono text-[10px] text-muted-foreground">{t.role}</span>
              <span className="mt-1 block truncate text-xs text-muted-foreground">{t.preview}</span>
            </span>
            {t.unread > 0 && <Badge tone="brand">{t.unread}</Badge>}
          </button>
        ))}
      </Card>

      <Card className="flex max-h-[70vh] flex-col">
        {active ? (
          <>
            <div className="flex items-center gap-3 border-b border-line p-4">
              <Avatar initials={active.initials} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{active.name}</p>
                <p className="truncate font-mono text-[10px] text-muted-foreground">{active.role}</p>
              </div>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              {active.messages.map((m) => (
                <div key={m.id} className={`flex ${m.from === "me" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      m.from === "me" ? "bg-brand/20 text-cream" : "bg-panel-2 text-muted-foreground"
                    }`}
                  >
                    {m.body}
                    <span className="mt-1.5 block font-mono text-[10px] opacity-60">{m.time}</span>
                  </div>
                </div>
              ))}
            </div>
            <form
              className="flex items-center gap-2 border-t border-line p-4"
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
            >
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Write a message…"
                aria-label="Message"
              />
              <Button type="submit" size="icon" aria-label="Send message">
                <Send size={16} />
              </Button>
            </form>
          </>
        ) : (
          <p className="p-8 text-center text-sm text-muted-foreground">Select a conversation to start reading.</p>
        )}
      </Card>
    </div>
  );
}
