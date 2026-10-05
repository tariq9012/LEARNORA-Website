import { formatRelativeTime } from "@/lib/format";
import { ReportButton } from "@/components/moderation/ReportButton";

const REMOVED_PLACEHOLDER = "Message removed by moderation.";
import type { MessageDto } from "@/server/dto/communication";

/**
 * One chat bubble. The message body is rendered ONLY as a React text node
 * (React escapes it), with CSS handling line breaks. There is deliberately no
 * dangerouslySetInnerHTML anywhere in the messaging UI, so a message such as
 * `<script>alert(1)</script>` is displayed literally and never executes.
 */
export function MessageBubble({ message }: { message: MessageDto }) {
  return (
    <div className={`flex ${message.mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          message.mine ? "bg-brand/20 text-cream" : "bg-panel-2 text-muted-foreground"
        }`}
      >
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        <span className="mt-1.5 flex items-center gap-2 font-mono text-[10px] opacity-60">
          {formatRelativeTime(message.createdAt)}
          {!message.mine && message.content !== REMOVED_PLACEHOLDER && (
            <ReportButton target={{ type: "message", messageId: message.id }} variant="ghost" />
          )}
        </span>
      </div>
    </div>
  );
}
