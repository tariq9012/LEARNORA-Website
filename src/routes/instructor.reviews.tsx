import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout, DashboardHeader } from "@/components/layout/DashboardLayout";
import { Card, Pagination, Rating, Select, StatCard, StatusBadge } from "@/components/ui/kit";
import { useServerList } from "@/hooks/use-server-list";
import { formatShortDate } from "@/lib/format";
import { getInstructorCoursesFn } from "@/server/functions/instructor-course";
import {
  getInstructorAnalyticsFn,
  getInstructorReviewsFn,
} from "@/server/functions/instructor-analytics";

export const Route = createFileRoute("/instructor/reviews")({
  loader: async () => {
    const [list, courses, analytics] = await Promise.all([
      getInstructorReviewsFn({ data: {} }),
      getInstructorCoursesFn(),
      getInstructorAnalyticsFn(),
    ]);
    return { list, courses, analytics };
  },
  head: () => ({
    meta: [
      { title: "Reviews — Learnora instructor" },
      {
        name: "description",
        content: "Read what students are saying about your Learnora courses.",
      },
      { property: "og:title", content: "Reviews — Learnora instructor" },
      { property: "og:description", content: "Student feedback on your Learnora courses." },
    ],
  }),
  component: InstructorReviews,
});

function InstructorReviews() {
  const { list, courses, analytics } = Route.useLoaderData();
  const { data, filters, setFilter, page, setPage, loading, error } = useServerList({
    initial: list,
    initialFilters: { courseId: "", rating: "", order: "newest" },
    fetcher: (p) =>
      getInstructorReviewsFn({
        data: {
          page: p.page,
          order: p.order as "newest" | "oldest",
          ...(p.courseId && { courseId: p.courseId }),
          ...(p.rating && { rating: Number(p.rating) }),
        },
      }),
  });

  return (
    <DashboardLayout role="instructor">
      <DashboardHeader
        title="Reviews"
        description="Feedback on your courses. Reviews are written by students and moderated by Learnora — you can read them but not change them."
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Average rating"
          value={analytics.averageRating != null ? analytics.averageRating.toFixed(1) : "—"}
          hint="Visible reviews only"
        />
        <StatCard label="Total reviews" value={analytics.reviewCount} hint="Visible reviews only" />
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Select
          value={filters.courseId}
          onChange={(e) => setFilter("courseId", e.target.value)}
          className="w-full sm:w-56"
          aria-label="Filter by course"
        >
          <option value="">All my courses</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </Select>
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
          value={filters.order}
          onChange={(e) => setFilter("order", e.target.value)}
          className="w-full sm:w-40"
          aria-label="Sort order"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </Select>
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      <div className="space-y-4">
        {data.reviews.length === 0 && (
          <Card className="px-6 py-12 text-center text-sm text-muted-foreground">
            {loading ? "Loading…" : "No reviews match these filters."}
          </Card>
        )}
        {data.reviews.map((r) => (
          <Card key={r.id} className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{r.reviewerName}</p>
                <p className="font-mono text-[10px] text-muted-foreground">
                  {r.courseTitle} · {formatShortDate(r.createdAt)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {r.hidden && <StatusBadge status="Hidden" />}
                <Rating value={r.rating} showValue={false} />
              </div>
            </div>
            {r.comment && <p className="mt-3 text-sm text-muted-foreground">{r.comment}</p>}
            {r.hidden && (
              <p className="mt-3 font-mono text-[10px] text-muted-foreground">
                Hidden by moderation — not shown publicly or counted in your rating.
              </p>
            )}
          </Card>
        ))}
      </div>
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
