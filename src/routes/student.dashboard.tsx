import { createFileRoute, Link, useRouteContext } from "@tanstack/react-router";
import {
  BookOpen,
  CheckCircle2,
  Clock3,
  Award,
  ArrowRight,
  Bell,
  MessageSquare,
} from "lucide-react";
import { DashboardLayout, DashboardHeader } from "@/components/layout/DashboardLayout";
import { Button, Card, ProgressBar, SectionHeading, StatCard } from "@/components/ui/kit";
import { CourseCard } from "@/components/course/CourseCard";
import { categoryImage } from "@/lib/course-images";
import { formatRelativeTime } from "@/lib/format";
import { getStudentDashboardLearningFn } from "@/server/functions/learning";
import { getCoursesFn } from "@/server/functions/catalog";
import { getMyCertificatesFn } from "@/server/functions/certificate";
import { getUnreadCountsFn } from "@/server/functions/notifications";

export const Route = createFileRoute("/student/dashboard")({
  loader: async () => {
    const [learning, recommendedPage, certificates, unread] = await Promise.all([
      getStudentDashboardLearningFn(),
      getCoursesFn({ data: { sort: "popular", page: 1, pageSize: 9 } }),
      getMyCertificatesFn(),
      getUnreadCountsFn(),
    ]);
    const enrolledSlugs = new Set(learning.allEnrollments.map((e) => e.courseSlug));
    const recommended = recommendedPage.items.filter((c) => !enrolledSlugs.has(c.id)).slice(0, 3);
    // Real activity only: enrolments, completions and certificates the student actually has.
    const activity = [
      ...learning.allEnrollments.map((e) => ({
        id: `enrolled-${e.enrollmentId}`,
        at: e.enrolledAt,
        text: `Enrolled in ${e.title}`,
      })),
      ...learning.allEnrollments
        .filter((e) => e.completedAt)
        .map((e) => ({
          id: `completed-${e.enrollmentId}`,
          at: e.completedAt as string,
          text: `Completed ${e.title}`,
        })),
      ...certificates.map((c) => ({
        id: `cert-${c.id}`,
        at: c.issuedAt,
        text: `Earned a certificate for ${c.courseTitle}`,
      })),
    ]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 5);
    return { learning, recommended, certificateCount: certificates.length, unread, activity };
  },
  head: () => ({
    meta: [
      { title: "Student dashboard — Learnora" },
      {
        name: "description",
        content: "Track your enrolled courses, learning hours and certificates.",
      },
      { property: "og:title", content: "Student dashboard — Learnora" },
      { property: "og:description", content: "Your Learnora learning overview." },
    ],
  }),
  component: StudentDashboard,
});

function StudentDashboard() {
  const { learning, recommended, certificateCount, unread, activity } = Route.useLoaderData();
  const { user } = useRouteContext({ from: "__root__" });
  const firstName = user?.name.split(" ")[0] ?? "there";

  return (
    <DashboardLayout role="student">
      <DashboardHeader
        title={`Welcome back, ${firstName}`}
        description="Continue your learning journey where you left off."
        action={
          <Link to="/courses">
            <Button variant="outline">Browse courses</Button>
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Courses enrolled" value={learning.enrolledCount} icon={BookOpen} />
        <StatCard label="Courses completed" value={learning.completedCount} icon={CheckCircle2} />
        <StatCard label="Learning hours" value="—" hint="Coming in a later phase" icon={Clock3} />
        <StatCard label="Certificates" value={certificateCount} icon={Award} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Link to="/student/notifications">
          <StatCard label="Unread notifications" value={unread.notifications} icon={Bell} />
        </Link>
        <Link to="/student/messages">
          <StatCard label="Unread messages" value={unread.messages} icon={MessageSquare} />
        </Link>
      </div>

      <section className="mt-12">
        <SectionHeading
          eyebrow="Continue learning"
          title="Pick up where you left off"
          action={
            <Link to="/student/learning" className="text-sm text-muted-foreground hover:text-cream">
              My learning →
            </Link>
          }
          className="mb-6"
        />
        {learning.continueLearning.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-sm text-muted-foreground">
              You have not started a course yet.{" "}
              <Link to="/courses" className="text-brand-soft hover:underline">
                Browse the catalogue
              </Link>{" "}
              to get going.
            </p>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            {learning.continueLearning.map((e) => (
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
                  <h3 className="font-display text-lg leading-snug tracking-tight">{e.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{e.instructor}</p>
                  {e.nextLessonTitle && (
                    <p className="mt-3 font-mono text-[11px] text-muted-foreground">
                      Next: {e.nextLessonTitle}
                    </p>
                  )}
                  <ProgressBar value={e.progress} label="Progress" className="mt-4" />
                  <Link
                    to="/student/course/$courseId"
                    params={{ courseId: e.courseSlug }}
                    className="mt-5 block"
                  >
                    <Button block>
                      Continue learning <ArrowRight size={15} />
                    </Button>
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <div className="mt-12 grid gap-8 lg:grid-cols-[1fr_340px]">
        <section>
          <SectionHeading
            eyebrow="My courses"
            title="Everything you are enrolled in"
            className="mb-6"
          />
          {learning.allEnrollments.length === 0 ? (
            <Card className="p-6 text-sm text-muted-foreground">No enrollments yet.</Card>
          ) : (
            <Card className="divide-y divide-line">
              {learning.allEnrollments.map((e) => (
                <div key={e.enrollmentId} className="flex flex-wrap items-center gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{e.title}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {e.instructor} · enrolled {new Date(e.enrolledAt).toLocaleDateString()}
                    </p>
                  </div>
                  <ProgressBar value={e.progress} className="w-full sm:w-40" />
                  <span className="font-mono text-[11px] text-muted-foreground">{e.progress}%</span>
                  <Link to="/student/course/$courseId" params={{ courseId: e.courseSlug }}>
                    <Button variant="outline" size="sm">
                      {e.completed ? "Review" : "Resume"}
                    </Button>
                  </Link>
                </div>
              ))}
            </Card>
          )}
        </section>

        <section>
          <SectionHeading eyebrow="Activity" title="Recent activity" className="mb-6" />
          <Card className="divide-y divide-line">
            {activity.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                Nothing yet — enrol in a course and your activity will show up here.
              </p>
            ) : (
              activity.map((a) => (
                <div key={a.id} className="p-4">
                  <p className="text-sm leading-relaxed">{a.text}</p>
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                    {formatRelativeTime(a.at)}
                  </p>
                </div>
              ))
            )}
          </Card>
        </section>
      </div>

      {recommended.length > 0 && (
        <section className="mt-12">
          <SectionHeading eyebrow="For you" title="Recommended next" className="mb-6" />
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {recommended.map((c) => (
              <CourseCard key={c.id} course={c} />
            ))}
          </div>
        </section>
      )}
    </DashboardLayout>
  );
}
