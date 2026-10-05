import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { DashboardLayout, DashboardHeader } from "@/components/layout/DashboardLayout";
import {
  Button,
  DataTable,
  Pagination,
  Rating,
  SearchBar,
  Select,
  StatusBadge,
} from "@/components/ui/kit";
import { useServerList } from "@/hooks/use-server-list";
import { formatShortDate } from "@/lib/format";
import { getAdminReviewsFn, setReviewHiddenFn } from "@/server/functions/admin-operations";
import type { AdminReviewDTO } from "@/server/dto/admin";

export const Route = createFileRoute("/admin/reviews")({
  loader: async () => ({ list: await getAdminReviewsFn({ data: {} }) }),
  head: () => ({
    meta: [
      { title: "Reviews — Learnora admin" },
      { name: "description", content: "Moderate course reviews: hide or restore content." },
      { property: "og:title", content: "Reviews — Learnora admin" },
      { property: "og:description", content: "Learnora review moderation." },
    ],
  }),
  component: AdminReviews,
});

function AdminReviews() {
  const { list } = Route.useLoaderData();
  const { data, filters, setFilter, page, setPage, loading, error, reload } = useServerList({
    initial: list,
    initialFilters: { search: "", rating: "", visibility: "" },
    fetcher: (p) =>
      getAdminReviewsFn({
        data: {
          page: p.page,
          ...(p.search && { search: p.search }),
          ...(p.rating && { rating: Number(p.rating) }),
          ...(p.visibility && { visibility: p.visibility }),
        },
      }),
  });

  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  async function toggle(review: AdminReviewDTO) {
    setBusyId(review.id);
    setActionError("");
    const result = await setReviewHiddenFn({
      data: { reviewId: review.id, hidden: !review.hidden },
    });
    setBusyId(null);
    if (!result.success) {
      setActionError(result.error);
      return;
    }
    await reload();
  }

  return (
    <DashboardLayout role="admin">
      <DashboardHeader
        title="Reviews"
        description="Hidden reviews are removed from public lists and rating averages. Reported reviews are handled in Reports."
        action={
          <Link to="/admin/reports">
            <Button variant="outline">Open reports</Button>
          </Link>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="min-w-64 flex-1">
          <SearchBar
            placeholder="Search text, reviewer or course"
            value={filters.search}
            onChange={(v) => setFilter("search", v)}
          />
        </div>
        <Select
          value={filters.rating}
          onChange={(e) => setFilter("rating", e.target.value)}
          className="w-full sm:w-40"
          aria-label="Filter by rating"
        >
          <option value="">All ratings</option>
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {n} stars
            </option>
          ))}
        </Select>
        <Select
          value={filters.visibility}
          onChange={(e) => setFilter("visibility", e.target.value)}
          className="w-full sm:w-40"
          aria-label="Filter by visibility"
        >
          <option value="">All reviews</option>
          <option value="visible">Visible</option>
          <option value="hidden">Hidden</option>
        </Select>
      </div>

      {(error || actionError) && (
        <p className="mb-4 text-sm text-destructive">{error || actionError}</p>
      )}

      <DataTable<AdminReviewDTO>
        caption="Reviews"
        empty={loading ? "Loading…" : "No reviews match these filters."}
        rows={data.reviews}
        columns={[
          {
            key: "review",
            header: "Review",
            render: (r) => (
              <div className="max-w-md">
                <p className="text-sm">
                  {r.comment ? r.comment.slice(0, 160) : <em>No written comment</em>}
                </p>
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                  {r.reviewerName} · {r.courseTitle}
                </p>
              </div>
            ),
          },
          {
            key: "rating",
            header: "Rating",
            render: (r) => <Rating value={r.rating} showValue={false} />,
          },
          { key: "date", header: "Date", render: (r) => formatShortDate(r.createdAt) },
          {
            key: "status",
            header: "Visibility",
            render: (r) => <StatusBadge status={r.hidden ? "Hidden" : "Visible"} />,
          },
          {
            key: "actions",
            header: "",
            className: "text-right",
            render: (r) => (
              <Button
                variant="outline"
                size="sm"
                disabled={busyId === r.id}
                onClick={() => void toggle(r)}
              >
                {busyId === r.id && <Loader2 size={14} className="animate-spin" />}
                {r.hidden ? "Restore" : "Hide"}
              </Button>
            ),
          },
        ]}
      />
      <Pagination
        page={page}
        pageSize={data.pageSize}
        total={data.total}
        onChange={setPage}
        disabled={loading}
      />
    </DashboardLayout>
  );
}
