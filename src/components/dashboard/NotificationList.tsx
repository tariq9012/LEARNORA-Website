import { useState } from "react";
import { BookOpen, MessageSquare, Settings, Trophy, type LucideIcon } from "lucide-react";
import { Badge, Button, Card, EmptyState } from "@/components/ui/kit";
import { notifications as seed, type NotificationItemData } from "@/data/mock";

const icons: Record<NotificationItemData["kind"], LucideIcon> = {
  course: BookOpen,
  message: MessageSquare,
  system: Settings,
  achievement: Trophy,
};

export function NotificationItem({
  item,
  onRead,
}: {
  item: NotificationItemData;
  onRead: (id: string) => void;
}) {
  const Icon = icons[item.kind];
  return (
    <div className={`flex gap-4 p-4 transition-colors ${item.unread ? "bg-brand/5" : ""}`}>
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-panel-2 text-brand-soft ring-1 ring-line">
        <Icon size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">{item.title}</p>
          {item.unread && <Badge tone="brand">New</Badge>}
        </div>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
        <p className="mt-1.5 font-mono text-[10px] text-muted-foreground">{item.time}</p>
      </div>
      {item.unread && (
        <Button variant="ghost" size="sm" onClick={() => onRead(item.id)}>
          Mark read
        </Button>
      )}
    </div>
  );
}

export function NotificationList() {
  const [items, setItems] = useState(seed);
  const unread = items.filter((i) => i.unread).length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="text-cream">{unread}</span> unread of {items.length}
        </p>
        {unread > 0 && (
          <Button variant="outline" size="sm" onClick={() => setItems((p) => p.map((i) => ({ ...i, unread: false })))}>
            Mark all as read
          </Button>
        )}
      </div>
      {items.length === 0 ? (
        <EmptyState title="No notifications" description="Course updates and replies will show up here." />
      ) : (
        <Card className="divide-y divide-line">
          {items.map((i) => (
            <NotificationItem
              key={i.id}
              item={i}
              onRead={(id) => setItems((p) => p.map((n) => (n.id === id ? { ...n, unread: false } : n)))}
            />
          ))}
        </Card>
      )}
    </div>
  );
}
