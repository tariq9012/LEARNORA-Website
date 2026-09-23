import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { DashboardLayout, DashboardHeader } from "@/components/layout/DashboardLayout";
import { Button, Card, Rating, StatCard, Tabs } from "@/components/ui/kit";
import { ReviewCard } from "@/components/course/ReviewCard";
import { reviews } from "@/data/mock";

export const Route = createFileRoute("/instructor/reviews")({
  head: () => ({
    meta: [
      { title: "Reviews — Learnora instructor" },
      { name: "description", content: "Read and reply to the reviews students leave on your Learnora courses." },
      { property: "og:title", content: "Reviews — Learnora instructor" },
      { property: "og:description", content: "Student feedback on your Learnora courses." },
    ],
  }),
  component: InstructorReviews,
});

function InstructorReviews() {
  const [tab, setTab] = useState("all");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [sent, setSent] = useState<string[]>([]);

  const avg = reviews.reduce((n, r) => n + r.rating, 0) / reviews.length;
  const rows = tab === "all" ? reviews : reviews.filter((r) => (tab === "high" ? r.rating >= 4.5 : r.rating < 4.5));

  return (
    <DashboardLayout role="instructor">
      <DashboardHeader title="Reviews" description="Replying to feedback is the fastest way to lift a course rating." />

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <StatCard label="Average rating" value={avg.toFixed(2)} />
        <StatCard label="Total reviews" value={reviews.length} />
        <StatCard label="Replies sent" value={sent.length} hint="This session" />
      </div>

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "all", label: "All reviews" },
          { id: "high", label: "4.5 and above" },
          { id: "low", label: "Needs attention" },
        ]}
      />

      <div className="mt-6 space-y-4">
        {rows.map((r) => (
          <div key={r.id}>
            <ReviewCard review={r} />
            <div className="mt-2 flex flex-wrap items-center gap-3 pl-1">
              <Button variant="ghost" size="sm" onClick={() => setReplyTo(replyTo === r.id ? null : r.id)}>
                {replyTo === r.id ? "Cancel" : "Reply"}
              </Button>
              <Rating value={r.rating} showValue={false} />
              {sent.includes(r.id) && <span className="font-mono text-[10px] text-good">Reply sent (demo)</span>}
            </div>
            {replyTo === r.id && (
              <Card className="mt-3 p-4">
                <textarea
                  className="w-full resize-y rounded-lg bg-panel-2 px-3.5 py-2.5 text-sm text-cream outline-none ring-1 ring-line focus:ring-brand/60"
                  rows={3}
                  placeholder={`Reply to ${r.author}…`}
                  aria-label={`Reply to ${r.author}`}
                />
                <div className="mt-3 flex justify-end">
                  <Button
                    size="sm"
                    onClick={() => {
                      setSent((p) => [...p, r.id]);
                      setReplyTo(null);
                    }}
                  >
                    Send reply
                  </Button>
                </div>
              </Card>
            )}
          </div>
        ))}
      </div>
    </DashboardLayout>
  );
}
