import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { z } from "zod";
import {
  Award,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  Lock,
  Menu,
  X,
} from "lucide-react";
import { Badge, Button, Card, ProgressBar } from "@/components/ui/kit";
import { VideoPlayerPlaceholder } from "@/components/course/VideoPlayerPlaceholder";
import { LessonVideoPlayer } from "@/components/course/LessonVideoPlayer";
import { Logo } from "@/components/layout/Logo";
import { formatMonthYear } from "@/lib/format";
import { getCourseLearningFn, markLessonCompleteFn } from "@/server/functions/learning";
import { getOrCreateCertificateFn } from "@/server/functions/certificate";
import type { CourseLearningDTO } from "@/server/dto/learning";

const searchSchema = z.object({ lesson: z.string().optional() });

export const Route = createFileRoute("/student/course/$courseId")({
  validateSearch: searchSchema,
  loader: async ({ params }) => {
    const result = await getCourseLearningFn({ data: { courseSlug: params.courseId } });
    return { result };
  },
  head: ({ loaderData }) => {
    if (!loaderData?.result.ok) {
      return {
        meta: [{ title: "Course unavailable — Learnora" }, { name: "robots", content: "noindex" }],
      };
    }
    return {
      meta: [
        { title: `Learning: ${loaderData.result.data.title} — Learnora` },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: CoursePlayerRoute,
});

function CoursePlayerRoute() {
  const { result } = Route.useLoaderData();

  if (!result.ok) {
    return (
      <div className="grid min-h-screen place-items-center px-6 text-center">
        <div>
          <h1 className="font-display text-3xl tracking-tight">
            {result.reason === "not_enrolled"
              ? "You're not enrolled in this course"
              : "Course not found"}
          </h1>
          <p className="mt-3 text-muted-foreground">
            {result.reason === "not_enrolled"
              ? "Enrol in this course to access its lessons."
              : "This course may have been removed or renamed."}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link to="/student/learning">
              <Button variant="outline">Back to my learning</Button>
            </Link>
            <Link to="/courses">
              <Button>Browse courses</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <CoursePlayer course={result.data} />;
}

function CoursePlayer({ course }: { course: CourseLearningDTO }) {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const flat = useMemo(
    () => course.sections.flatMap((s) => s.lessons.map((l) => ({ ...l, sectionTitle: s.title }))),
    [course],
  );

  const initialLessonId = search.lesson ?? course.nextLessonId ?? flat[0]?.id;
  const initialIndex = Math.max(
    0,
    flat.findIndex((l) => l.id === initialLessonId),
  );

  const [current, setCurrent] = useState(initialIndex);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set(course.completedLessonIds));
  const [overallPercent, setOverallPercent] = useState(course.overallPercent);
  const [courseCompleted, setCourseCompleted] = useState(course.courseCompleted);
  const [navOpen, setNavOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const lesson = flat[current];
  const unlockedUpTo = Math.max(completedIds.size, current);

  function goTo(index: number) {
    setCurrent(index);
    setNavOpen(false);
    const targetId = flat[index]?.id;
    if (targetId) {
      void navigate({ search: { lesson: targetId }, replace: true });
    }
  }

  async function toggleComplete() {
    if (!lesson || saving) return;
    setSaving(true);
    const nextCompleted = !completedIds.has(lesson.id);
    try {
      const result = await markLessonCompleteFn({
        data: { courseSlug: course.courseSlug, lessonId: lesson.id, completed: nextCompleted },
      });
      if (result.success) {
        setCompletedIds(new Set(result.data.completedLessonIds));
        setOverallPercent(result.data.overallPercent);
        setCourseCompleted(result.data.courseCompleted);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleVideoProgress(data: {
    watchedSeconds: number;
    completed: boolean;
    overallPercent: number | null;
    courseCompleted: boolean | null;
  }) {
    if (!lesson || !data.completed) return;
    setCompletedIds((prev) => {
      const next = new Set(prev);
      next.add(lesson.id);
      return next;
    });
    if (data.overallPercent !== null) setOverallPercent(data.overallPercent);
    if (data.courseCompleted !== null) setCourseCompleted(data.courseCompleted);
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="border-b border-line p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Course progress
        </p>
        <p className="mt-2 font-display text-2xl">{overallPercent}%</p>
        <ProgressBar value={overallPercent} className="mt-2" />
        <p className="mt-2 font-mono text-[10px] text-muted-foreground">
          {completedIds.size} of {flat.length} lessons complete
        </p>
        {courseCompleted && (
          <p className="mt-2 flex items-center gap-1.5 font-mono text-[10px] text-good">
            <CheckCircle2 size={12} /> Course completed
          </p>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {course.sections.map((s) => {
          const sectionLessons = s.lessons.map((l) => flat.findIndex((f) => f.id === l.id));
          const done = s.lessons.filter((l) => completedIds.has(l.id)).length;
          return (
            <div key={s.id} className="border-b border-line">
              <div className="flex items-center justify-between px-5 py-3">
                <p className="text-sm font-medium">{s.title}</p>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {done}/{s.lessons.length}
                </span>
              </div>
              <ul className="pb-2">
                {s.lessons.map((l, i) => {
                  const idx = sectionLessons[i] ?? 0;
                  const isDone = completedIds.has(l.id);
                  const locked = idx > unlockedUpTo + 1;
                  const active = idx === current;
                  return (
                    <li key={l.id}>
                      <button
                        disabled={locked}
                        onClick={() => goTo(idx)}
                        className={`flex w-full items-center gap-3 px-5 py-2.5 text-left text-sm transition-colors disabled:opacity-45 ${
                          active
                            ? "bg-brand/15 text-brand-soft"
                            : "text-muted-foreground hover:bg-panel-2 hover:text-cream"
                        }`}
                      >
                        {locked ? (
                          <Lock size={14} className="shrink-0" />
                        ) : isDone ? (
                          <CheckCircle2 size={14} className="shrink-0 text-good" />
                        ) : (
                          <Circle size={14} className="shrink-0" />
                        )}
                        <span className="min-w-0 flex-1 truncate">{l.title}</span>
                        <span className="font-mono text-[10px]">{l.duration}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:flex">
      <main className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-3">
          <div className="flex min-w-0 items-center gap-4">
            <Logo withTag={false} />
            <span className="hidden min-w-0 truncate border-l border-line pl-4 text-sm text-muted-foreground md:block">
              {course.title}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/student/learning" className="hidden sm:block">
              <Button variant="ghost" size="sm">
                <ArrowLeft size={14} /> My learning
              </Button>
            </Link>
            <button
              onClick={() => setNavOpen(true)}
              className="rounded-md p-2 text-muted-foreground hover:text-cream lg:hidden"
              aria-label="Open curriculum"
            >
              <Menu size={18} />
            </button>
          </div>
        </div>

        <div className="mx-auto max-w-[900px] px-5 py-8 sm:px-8">
          {courseCompleted && (
            <CourseCompletedBanner
              courseSlug={course.courseSlug}
              completedAt={course.completedAt}
            />
          )}
          {lesson?.videoUrl ? (
            <LessonVideoPlayer
              videoUrl={lesson.videoUrl}
              categorySlug={course.categorySlug}
              courseSlug={course.courseSlug}
              lessonId={lesson.id}
              initialWatchedSeconds={lesson.watchedSeconds}
              initialCompleted={completedIds.has(lesson.id)}
              onProgress={handleVideoProgress}
            />
          ) : (
            <VideoPlayerPlaceholder
              categorySlug={course.categorySlug}
              label={lesson?.title ?? "Lesson"}
              {...(lesson?.duration !== undefined && { caption: lesson.duration })}
            />
          )}

          <div className="mt-8">
            <div className="flex flex-wrap items-center gap-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-brand-soft">
                {lesson?.sectionTitle}
              </p>
              {lesson && completedIds.has(lesson.id) && <Badge tone="good">Completed</Badge>}
            </div>
            <h1 className="mt-3 font-display text-3xl tracking-tight">{lesson?.title}</h1>
            <p className="mt-4 leading-relaxed text-pretty text-muted-foreground">
              {lesson?.description}
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-line pt-6">
              <Button
                variant="outline"
                disabled={current === 0}
                onClick={() => goTo(Math.max(0, current - 1))}
              >
                <ArrowLeft size={15} /> Previous lesson
              </Button>
              <Button
                variant="outline"
                disabled={current >= flat.length - 1}
                onClick={() => goTo(Math.min(flat.length - 1, current + 1))}
              >
                Next lesson <ArrowRight size={15} />
              </Button>
              <div className="flex-1" />
              <Button onClick={toggleComplete} disabled={saving}>
                <Check size={15} />
                {lesson && completedIds.has(lesson.id) ? "Mark as incomplete" : "Mark as complete"}
              </Button>
            </div>

            <Card className="mt-8 p-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                Lesson resources
              </p>
              {lesson && lesson.resources.length > 0 ? (
                <ul className="mt-3 space-y-2 text-sm">
                  {lesson.resources.map((r) => (
                    <li key={r.id}>
                      <a
                        href={r.downloadUrl}
                        className="text-brand-soft underline decoration-brand-soft/40 underline-offset-4 hover:decoration-brand-soft"
                      >
                        {r.title}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  No resources attached to this lesson.
                </p>
              )}
            </Card>
          </div>
        </div>
      </main>

      <aside className="sticky top-0 hidden h-screen w-80 shrink-0 border-l border-line bg-panel/60 lg:block">
        {sidebar}
      </aside>

      {navOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-ink/80 backdrop-blur-sm"
            onClick={() => setNavOpen(false)}
          />
          <div className="absolute inset-y-0 right-0 w-80 max-w-[85vw] border-l border-line bg-panel">
            <button
              onClick={() => setNavOpen(false)}
              aria-label="Close curriculum"
              className="absolute right-3 top-3 z-10 rounded-md p-2 text-muted-foreground hover:text-cream"
            >
              <X size={18} />
            </button>
            {sidebar}
          </div>
        </div>
      )}
    </div>
  );
}

function CourseCompletedBanner({
  courseSlug,
  completedAt,
}: {
  courseSlug: string;
  completedAt: string | null;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleGetCertificate() {
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
    <Card className="mb-6 flex flex-wrap items-center justify-between gap-4 border-good/40 bg-good/5 p-5">
      <div>
        <p className="flex items-center gap-1.5 font-medium text-good">
          <CheckCircle2 size={16} /> Course completed
        </p>
        {completedAt && (
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            Completed {formatMonthYear(new Date(completedAt))}
          </p>
        )}
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </div>
      <div className="flex gap-2">
        <Link to="/courses/$courseId" params={{ courseId: courseSlug }} hash="reviews">
          <Button variant="outline" size="sm">
            Leave a review
          </Button>
        </Link>
        <Button size="sm" onClick={handleGetCertificate} disabled={busy}>
          <Award size={14} /> {busy ? "…" : "Get certificate"}
        </Button>
      </div>
    </Card>
  );
}
