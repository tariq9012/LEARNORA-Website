import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { SiteLayout } from "@/components/layout/SiteLayout";
import { Avatar, Badge, Button, Card, SectionHeading } from "@/components/ui/kit";
import { CourseCard } from "@/components/course/CourseCard";
import { getInstructorProfileFn } from "@/server/functions/catalog";

export const Route = createFileRoute("/instructors/$instructorId")({
  loader: async ({ params }) => {
    const result = await getInstructorProfileFn({ data: { instructorId: params.instructorId } });
    if (!result) throw notFound();
    return result;
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [
          { title: "Instructor unavailable — Learnora" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    const { instructor } = loaderData;
    return {
      meta: [
        { title: `${instructor.name} — Learnora instructor` },
        {
          name: "description",
          content: `${instructor.name}: ${instructor.title}. ${instructor.expertise.join(", ")}.`,
        },
        { property: "og:title", content: `${instructor.name} — Learnora instructor` },
        { property: "og:description", content: instructor.bio.slice(0, 155) },
      ],
    };
  },
  notFoundComponent: () => (
    <SiteLayout>
      <div className="mx-auto max-w-[1240px] px-6 py-24 text-center">
        <h1 className="font-display text-4xl tracking-tight">Instructor not found</h1>
        <Link to="/courses" className="mt-6 inline-block">
          <Button>Browse courses</Button>
        </Link>
      </div>
    </SiteLayout>
  ),
  component: InstructorProfile,
});

function InstructorProfile() {
  const { instructor, courses } = Route.useLoaderData();

  return (
    <SiteLayout>
      <header className="glow border-b border-line">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-start gap-8 px-6 py-14">
          <Avatar initials={instructor.initials} src={instructor.avatarUrl} size="xl" />
          <div className="min-w-0 flex-1">
            <p className="eyebrow">Instructor</p>
            <h1 className="mt-3 font-display text-4xl tracking-tight">{instructor.name}</h1>
            <p className="mt-1.5 text-muted-foreground">{instructor.title}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {instructor.expertise.map((e) => (
                <Badge key={e} tone="soft">
                  {e}
                </Badge>
              ))}
            </div>
            <p className="mt-5 max-w-[62ch] leading-relaxed text-pretty text-muted-foreground">
              {instructor.bio}
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              {instructor.social.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  className="rounded-md px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground ring-1 ring-line transition-colors hover:text-brand-soft hover:ring-brand/40"
                >
                  {s.label}
                </a>
              ))}
            </div>
          </div>
          <Card className="grid w-full grid-cols-2 gap-6 p-6 sm:w-auto sm:grid-cols-4 lg:w-64 lg:grid-cols-2">
            {[
              { l: "Rating", v: instructor.rating },
              { l: "Students", v: instructor.students.toLocaleString() },
              { l: "Courses", v: instructor.courses },
              { l: "Reviews", v: instructor.reviews.toLocaleString() },
            ].map((s) => (
              <div key={s.l}>
                <p className="font-display text-2xl">{s.v}</p>
                <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                  {s.l}
                </p>
              </div>
            ))}
          </Card>
        </div>
      </header>

      <section className="mx-auto max-w-[1240px] px-6 py-14">
        <SectionHeading eyebrow="Catalogue" title={`Courses by ${instructor.name.split(" ")[0]}`} />
        {courses.length > 0 ? (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {courses.map((c) => (
              <CourseCard key={c.id} course={c} />
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">No published courses yet.</p>
        )}
      </section>
    </SiteLayout>
  );
}
