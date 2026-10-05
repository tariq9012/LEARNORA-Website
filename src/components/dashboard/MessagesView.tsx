import { useCallback, useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { Avatar, Badge, Button, Card, Input } from "@/components/ui/kit";
import { formatRelativeTime, initialsOf } from "@/lib/format";
import { newClientMessageId, requestCommRefresh, usePollingRefresh } from "@/lib/comm-refresh";
import {
  getConversationMessagesFn,
  getMyConversationsFn,
  markConversationReadFn,
  sendMessageFn,
} from "@/server/functions/messaging";
import { MessageBubble } from "@/components/dashboard/MessageBubble";
import { MAX_MESSAGE_LENGTH } from "@/server/validation/communication";
import type {
  ConversationListDto,
  ConversationSummaryDto,
  MessageDto,
} from "@/server/dto/communication";

const POLL_MS = 20_000;

function mergeMessages(prev: MessageDto[], incoming: MessageDto[]): MessageDto[] {
  const byId = new Map(prev.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) =>
    a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt.localeCompare(b.createdAt),
  );
}

/**
 * Real student/instructor inbox. Everything shown comes from the server;
 * message text is rendered ONLY as a React text node (with CSS line breaks) —
 * no dangerouslySetInnerHTML anywhere, so "<script>" appears literally.
 */
export function MessagesView({
  initial,
  activeId,
  onSelect,
  emptyHint,
}: {
  initial: ConversationListDto;
  activeId: string | null;
  onSelect: (id: string | null) => void;
  emptyHint: string;
}) {
  const [conversations, setConversations] = useState(initial.conversations);
  const [detail, setDetail] = useState<ConversationSummaryDto | null>(null);
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [draft, setDraft] = useState("");
  const [clientId, setClientId] = useState(newClientMessageId);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const activeRef = useRef<string | null>(activeId);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const stickToBottom = useRef(true);
  activeRef.current = activeId;

  useEffect(() => setConversations(initial.conversations), [initial]);

  const refreshList = useCallback(async () => {
    try {
      const list = await getMyConversationsFn({ data: {} });
      setConversations(list.conversations);
    } catch {
      // silent; next poll retries
    }
  }, []);

  const markRead = useCallback(
    async (conversationId: string, lastMessageId: string | undefined) => {
      const result = await markConversationReadFn({
        data: lastMessageId ? { conversationId, upToMessageId: lastMessageId } : { conversationId },
      });
      if (result.success) {
        setConversations((prev) =>
          prev.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c)),
        );
        requestCommRefresh();
      }
    },
    [],
  );

  // Load the active conversation (and mark it read) whenever the selection changes.
  useEffect(() => {
    setSendError("");
    setLoadError("");
    if (!activeId) {
      setDetail(null);
      setMessages([]);
      setOlderCursor(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setMessages([]);
    setDetail(null);
    stickToBottom.current = true;
    void (async () => {
      try {
        const result = await getConversationMessagesFn({ data: { conversationId: activeId } });
        if (cancelled || activeRef.current !== activeId) return;
        if (!result.success) {
          setLoadError(result.error);
          return;
        }
        setDetail(result.data.conversation);
        setMessages(result.data.messages);
        setOlderCursor(result.data.nextCursor);
        await markRead(activeId, result.data.messages[result.data.messages.length - 1]?.id);
      } catch {
        if (!cancelled) setLoadError("Couldn't load this conversation.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeId, markRead]);

  // Light polling while visible: inbox list + the open conversation's newest page.
  usePollingRefresh(() => {
    void refreshList();
    const id = activeRef.current;
    if (!id) return;
    void (async () => {
      try {
        const result = await getConversationMessagesFn({ data: { conversationId: id } });
        if (!result.success || activeRef.current !== id) return;
        setDetail(result.data.conversation);
        setMessages((prev) => {
          const merged = mergeMessages(prev, result.data.messages);
          return merged.length === prev.length ? prev : merged;
        });
        const incomingUnread = result.data.messages.some((m) => !m.mine);
        if (incomingUnread && result.data.conversation.unreadCount > 0) {
          await markRead(id, result.data.messages[result.data.messages.length - 1]?.id);
        }
      } catch {
        // silent
      }
    })();
  }, POLL_MS);

  useEffect(() => {
    if (stickToBottom.current) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function loadEarlier() {
    if (!activeId || !olderCursor) return;
    stickToBottom.current = false;
    const result = await getConversationMessagesFn({
      data: { conversationId: activeId, cursor: olderCursor },
    });
    if (!result.success) {
      setLoadError(result.error);
      return;
    }
    setMessages((prev) => mergeMessages(prev, result.data.messages));
    setOlderCursor(result.data.nextCursor);
  }

  async function send() {
    if (sending || !activeId || !detail?.canSend) return;
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    setSendError("");
    try {
      // `clientId` is the idempotency key for THIS composed message: if the
      // request is retried (double-click, flaky network), the server returns
      // the original message instead of creating a duplicate.
      const result = await sendMessageFn({
        data: { conversationId: activeId, content: text, clientMessageId: clientId },
      });
      if (!result.success) {
        setSendError(result.error);
        return;
      }
      stickToBottom.current = true;
      setMessages((prev) => mergeMessages(prev, [result.data]));
      setDraft("");
      setClientId(newClientMessageId());
      void refreshList();
      requestCommRefresh();
    } catch {
      setSendError("Couldn't send. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <Card className="max-h-[70vh] divide-y divide-line overflow-y-auto">
        {conversations.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">{emptyHint}</p>
        ) : (
          conversations.map((t) => (
            <button
              key={t.id}
              onClick={() => onSelect(t.id)}
              className={`flex w-full gap-3 p-4 text-left transition-colors ${
                t.id === activeId ? "bg-brand/10" : "hover:bg-panel-2"
              }`}
            >
              <Avatar initials={initialsOf(t.otherName)} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{t.otherName}</span>
                  {t.lastMessageAt && (
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                      {formatRelativeTime(t.lastMessageAt)}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block truncate font-mono text-[10px] text-muted-foreground">
                  {t.courseTitle ?? (t.otherRole === "INSTRUCTOR" ? "Instructor" : "Student")}
                </span>
                <span className="mt-1 block truncate text-xs text-muted-foreground">
                  {t.lastMessagePreview
                    ? `${t.lastMessageFromMe ? "You: " : ""}${t.lastMessagePreview}`
                    : "No messages yet"}
                </span>
              </span>
              {t.unreadCount > 0 && <Badge tone="brand">{t.unreadCount}</Badge>}
            </button>
          ))
        )}
      </Card>

      <Card className="flex max-h-[70vh] min-h-[420px] flex-col">
        {!activeId ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            Select a conversation to start reading.
          </p>
        ) : loadError && !detail ? (
          <p className="p-8 text-center text-sm text-destructive">{loadError}</p>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-line p-4">
              <Avatar initials={initialsOf(detail?.otherName ?? "…")} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{detail?.otherName ?? "Loading…"}</p>
                <p className="truncate font-mono text-[10px] text-muted-foreground">
                  {detail?.courseTitle ?? (loading ? "" : "Conversation")}
                </p>
              </div>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              {olderCursor && (
                <div className="text-center">
                  <Button variant="ghost" size="sm" onClick={loadEarlier}>
                    Load earlier messages
                  </Button>
                </div>
              )}
              {!loading && messages.length === 0 && (
                <p className="text-center text-sm text-muted-foreground">
                  No messages yet — say hello
                  {detail?.courseTitle ? ` about “${detail.courseTitle}”` : ""}.
                </p>
              )}
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}
              <div ref={bottomRef} />
            </div>
            {detail && !detail.canSend ? (
              <p className="border-t border-line p-4 text-sm text-muted-foreground">
                You no longer have access to this course, so you can read this conversation but
                can't send new messages.
              </p>
            ) : (
              <form
                className="border-t border-line p-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
              >
                <div className="flex items-center gap-2">
                  <Input
                    value={draft}
                    onChange={(e) => {
                      setDraft(e.target.value);
                      // Editing the text makes it a NEW message, so it gets a new idempotency key.
                      setClientId(newClientMessageId());
                    }}
                    placeholder="Write a message…"
                    aria-label="Message"
                    maxLength={MAX_MESSAGE_LENGTH}
                    disabled={sending || !detail}
                  />
                  <Button
                    type="submit"
                    size="icon"
                    aria-label="Send message"
                    disabled={sending || !draft.trim() || !detail}
                  >
                    <Send size={16} />
                  </Button>
                </div>
                {sendError && <p className="mt-2 text-xs text-destructive">{sendError}</p>}
              </form>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
