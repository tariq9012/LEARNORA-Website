import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { DashboardLayout, DashboardHeader } from "@/components/layout/DashboardLayout";
import { Button, DataTable, Rating, StatusBadge, Tabs } from "@/components/ui/kit";
import { reviews as seed, type Review } from "@/data/mock";

export const Route = createFileRoute("/admin/reviews")({
  head: () => ({
    meta: [
      { title: "Reviews — Learnora admin" },
      { name: "description", content: "Moderate course reviews, hide flagged content and approve pending feedback." },
      { property: "og:title", content: "Reviews — Learnora admin" },
      { property: "og:description", content: "Learnora review moderation." },
    ],
  }),
  component: AdminReviews,
});

function AdminReviews() {
  const [rows, setRows] = useState<Review[]>(seed);
  const [tab, setTab] = useState("all");

  const shown = tab === "all" ? rows : rows.filter((r) => r.status.toLowerCase() === tab);

  const setStatus = (id: string, status: Review["status"]) =>
    setRows((p) => p.map((r) => (r.id === id ? { ...r, status } : r)));

  return (
    <DashboardLayout role="admin">
      <DashboardHeader title="Reviews" description="Moderation decisions apply to this session only." />

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "all", label: "All" },
          { id: "published", label: "Published" },
          { id: "flagged", label: "Flagged" },
          { id: "pending", label: "Pending" },
        ]}
      />

      <div className="mt-6">
        <DataTable<Review>
          caption="Course reviews"
          empty="No reviews in this state."
          rows={shown}
          columns={[
            {
              key: "author",
              header: "Review",
              render: (r) => (
                <div className="max-w-md">
                  <p className="font-medium">{r.author}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{r.body}</p>
                </div>
              ),
            },
            { key: "course", header: "Course", render: (r) => r.course },
            { key: "rating", header: "Rating", render: (r) => <Rating value={r.rating} /> },
            { key: "date", header: "Date", render: (r) => r.date },
            { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
            {
              key: "actions",
              header: "",
              className: "text-right",
              render: (r) => (
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setStatus(r.id, "Published")}>
                    Approve
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setStatus(r.id, "Flagged")}>
                    Flag
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </div>
    </DashboardLayout>
  );
}
