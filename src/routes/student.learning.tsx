import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Award } from "lucide-react";
import { DashboardLayout, DashboardHeader } from "@/components/layout/DashboardLayout";
import { Button, Card, EmptyState, ProgressBar, Tabs } from "@/components/ui/kit";
import { categoryImage } from "@/lib/course-images";
import { formatMonthYear } from "@/lib/format";
import { getMyLearningFn } from "@/server/functions/learning";
import { getOrCreateCertificateFn } from "@/server/functions/certificate";

export const Route = createFileRoute("/student/learning")({
  loader: async () => ({ enrollments: await getMyLearningFn() }),
  head: () => ({
    meta: [
      { title: "My learning — Learnora" },
      {
        name: "description",
        content: "All your enrolled Learnora courses and progress in one place.",
      },
      { property: "og:title", content: "My learning — Learnora" },
      { property: "og:description", content: "Your in-progress and completed Learnora courses." },
    ],
  }),
  component: MyLearning,
});

function MyLearning() {
  const { enrollments: all } = Route.useLoaderData();
  const [tab, setTab] = useState("all");
  const rows =
    tab === "all"
      ? all
      : tab === "progress"
        ? all.filter((e) => !e.completed)
        : all.filter((e) => e.completed);

  return (
    <DashboardLayout role="student">
      <DashboardHeader
        title="My learning"
        description={`${all.length} course${all.length === 1 ? "" : "s"} enrolled.`}
      />

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "all", label: `All (${all.length})` },
          { id: "progress", label: `In progress (${all.filter((e) => !e.completed).length})` },
          { id: "done", label: `Completed (${all.filter((e) => e.completed).length})` },
        ]}
      />

      {rows.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="Nothing here yet"
            description="Courses you enrol in will appear here with your progress."
            action={
              <Link to="/courses">
                <Button>Browse courses</Button>
              </Link>
            }
          />
        </div>
      ) : (
        <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((e) => (
            <Card key={e.enrollmentId} className="flex flex-col overflow-hidden">
              <img
                src={categoryImage(e.categorySlug)}
                alt=""
                loading="lazy"
                width={1024}
                height={576}
                className="aspect-video w-full object-cover opacity-80"
              />
              <div className="flex flex-1 flex-col p-5">
                <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-brand-soft">
                  {e.category}
                </p>
                <h2 className="mt-2 font-display text-lg leading-snug tracking-tight">{e.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{e.instructor}</p>
                <div className="flex-1" />
                {!e.completed && e.nextLessonTitle && (
                  <p className="mt-3 font-mono text-[11px] text-muted-foreground">
                    Next: {e.nextLessonTitle}
                  </p>
                )}
                <ProgressBar
                  value={e.progress}
                  label={e.completed ? "Completed" : "Progress"}
                  className="mt-3"
                />
                {e.completed && e.completedAt && (
                  <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                    Completed {formatMonthYear(new Date(e.completedAt))}
                  </p>
                )}
                {e.completed ? (
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <GetCertificateButton courseSlug={e.courseSlug} />
                    <Link
                      to="/courses/$courseId"
                      params={{ courseId: e.courseSlug }}
                      hash="reviews"
                    >
                      <Button block variant="outline" size="sm">
                        Review
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <Link
                    to="/student/course/$courseId"
                    params={{ courseId: e.courseSlug }}
                    className="mt-4 block"
                  >
                    <Button block>Continue learning</Button>
                  </Link>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}

function GetCertificateButton({ courseSlug }: { courseSlug: string }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleClick() {
    setBusy(true);
    setError("");
    try {
      const result = await getOrCreateCertificateFn({ data: { courseSlug } });
      if (result.success) {
        await navigate({
          to: "/student/certificates/$certificateId",
          params: { certificateId: result.data.id },
        });
      } else {
        setError(result.error);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Button block size="sm" onClick={handleClick} disabled={busy}>
        <Award size={14} /> {busy ? "…" : "Certificate"}
      </Button>
      {error && <p className="mt-1 text-[11px] text-destructive">{error}</p>}
    </div>
  );
}
