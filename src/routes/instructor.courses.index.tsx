import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Star, Users, MoreVertical } from "lucide-react";
import { DashboardLayout, DashboardHeader } from "@/components/layout/DashboardLayout";
import { Button, Card, EmptyState, SearchBar, StatusBadge, Tabs } from "@/components/ui/kit";
import { currency } from "@/data/mock";
import { getInstructorCoursesFn } from "@/server/functions/instructor-course";
import type { InstructorCourseListItemDTO } from "@/server/dto/instructor-course";

export const Route = createFileRoute("/instructor/courses/")({
  loader: async () => ({ courses: await getInstructorCoursesFn() }),
  head: () => ({
    meta: [
      { title: "My courses — Learnora instructor" },
      { name: "description", content: "Manage your Learnora courses, drafts and submissions." },
      { property: "og:title", content: "My courses — Learnora instructor" },
      { property: "og:description", content: "Manage your Learnora courses." },
    ],
  }),
  component: InstructorCourses,
});

const statusLabel: Record<InstructorCourseListItemDTO["status"], string> = {
  PUBLISHED: "Published",
  PENDING_REVIEW: "Pending Review",
  DRAFT: "Draft",
  REJECTED: "Rejected",
  ARCHIVED: "Archived",
};

function InstructorCourses() {
  const { courses } = Route.useLoaderData();
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");

  const filtered = courses.filter((c) => {
    const matchesTab = tab === "all" || c.status.toLowerCase() === tab;
    const matchesQuery = c.title.toLowerCase().includes(query.toLowerCase());
    return matchesTab && matchesQuery;
  });

  const counts = {
    all: courses.length,
    draft: courses.filter((c) => c.status === "DRAFT").length,
    pending_review: courses.filter((c) => c.status === "PENDING_REVIEW").length,
    published: courses.filter((c) => c.status === "PUBLISHED").length,
    rejected: courses.filter((c) => c.status === "REJECTED").length,
    archived: courses.filter((c) => c.status === "ARCHIVED").length,
  };

  return (
    <DashboardLayout role="instructor">
      <DashboardHeader
        title="My courses"
        description={`${courses.length} course${courses.length === 1 ? "" : "s"} total.`}
        action={
          <Link to="/instructor/courses/create">
            <Button>
              <Plus size={16} /> New course
            </Button>
          </Link>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            { id: "all", label: `All (${counts.all})` },
            { id: "draft", label: `Draft (${counts.draft})` },
            { id: "pending_review", label: `Pending (${counts.pending_review})` },
            { id: "published", label: `Published (${counts.published})` },
            { id: "rejected", label: `Rejected (${counts.rejected})` },
            { id: "archived", label: `Archived (${counts.archived})` },
          ]}
        />
        <SearchBar
          value={query}
          onChange={setQuery}
          placeholder="Search my courses"
          className="max-w-[280px]"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="No courses here"
            description="Try a different filter, or create your first course."
            action={
              <Link to="/instructor/courses/create">
                <Button>Create a course</Button>
              </Link>
            }
          />
        </div>
      ) : (
        <div className="mt-8 space-y-3">
          {filtered.map((c) => (
            <Card key={c.id} className="flex flex-wrap items-center gap-4 p-4">
              <div className="h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-panel-2">
                {c.thumbnail && (
                  <img src={c.thumbnail} alt="" className="h-full w-full object-cover" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-medium">{c.title}</p>
                  <StatusBadge status={statusLabel[c.status]} />
                </div>
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                  {c.category} · {c.level} · {c.price === 0 ? "Free" : currency(c.price)}
                </p>
                {c.status === "REJECTED" && c.rejectionReason && (
                  <p className="mt-1.5 text-xs text-destructive">Rejected: {c.rejectionReason}</p>
                )}
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Users size={14} /> {c.students}
                </span>
                <span className="flex items-center gap-1.5">
                  <Star size={14} /> {c.reviewCount}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {c.status === "PUBLISHED" && (
                  <Link to="/courses/$courseId" params={{ courseId: c.slug }}>
                    <Button variant="ghost" size="sm">
                      View
                    </Button>
                  </Link>
                )}
                <Link to="/instructor/courses/$courseId" params={{ courseId: c.id }}>
                  <Button variant="outline" size="sm">
                    {c.status === "DRAFT" || c.status === "REJECTED" ? "Edit" : "Manage"}
                  </Button>
                </Link>
                <button
                  className="rounded-md p-2 text-muted-foreground hover:text-cream"
                  aria-label="More options"
                >
                  <MoreVertical size={16} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
