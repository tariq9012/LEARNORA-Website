import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteLayout, PageHeader } from "@/components/layout/SiteLayout";
import { Avatar, Button, Card, SectionHeading } from "@/components/ui/kit";
import { getInstructors, platformStats, compact } from "@/data/mock";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About Learnora — how we build courses" },
      {
        name: "description",
        content: "Learnora is an editorially curated learning platform. Every course is reviewed before publication.",
      },
      { property: "og:title", content: "About Learnora" },
      { property: "og:description", content: "How Learnora curates practitioner-led courses." },
    ],
  }),
  component: AboutPage,
});

const principles = [
  {
    title: "Editorial before video",
    body: "Every curriculum is reviewed by a subject editor before a single lesson is recorded. If the outline does not hold together, the course does not get made.",
  },
  {
    title: "Practitioners only",
    body: "We do not accept course proposals from full-time course sellers. Instructors must still be doing the work they teach.",
  },
  {
    title: "Maintained, not shipped",
    body: "Courses are revisited on a schedule. Anything that has drifted out of date is revised or retired rather than quietly left online.",
  },
  {
    title: "Honest pricing",
    body: "One price, lifetime access, no manufactured countdown timers. Discounts are seasonal and published in advance.",
  },
];

function AboutPage() {
  const team = getInstructors().slice(0, 4);

  return (
    <SiteLayout>
      <PageHeader
        eyebrow="About"
        title="A learning platform with an editorial spine"
        description="Learnora was founded in 2023 by three engineers and an editor who were tired of watching well-intentioned courses go stale six months after launch."
      />

      <section className="mx-auto max-w-[1240px] px-6 py-14">
        <div className="grid gap-10 lg:grid-cols-[1fr_360px]">
          <div className="space-y-5 text-lg leading-relaxed text-pretty text-muted-foreground">
            <p>
              We publish fewer courses than the large marketplaces, on purpose. Each one goes through an outline review,
              a technical read, a recording pass and an accessibility check before it reaches the catalogue.
            </p>
            <p>
              That process is slower and more expensive than open publishing, and it is the entire reason students
              finish our courses at more than twice the industry average. The catalogue you see is the catalogue we
              would recommend to a friend changing careers.
            </p>
          </div>
          <Card className="grid grid-cols-2 gap-6 p-6">
            {[
              { v: `${compact(platformStats.students)}+`, l: "Students" },
              { v: compact(platformStats.courses), l: "Courses" },
              { v: compact(platformStats.instructors), l: "Instructors" },
              { v: "96%", l: "Completion rate" },
            ].map((s) => (
              <div key={s.l}>
                <p className="font-display text-2xl">{s.v}</p>
                <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{s.l}</p>
              </div>
            ))}
          </Card>
        </div>
      </section>

      <section className="border-y border-line bg-panel/40">
        <div className="mx-auto max-w-[1240px] px-6 py-16">
          <SectionHeading eyebrow="Principles" title="What we hold ourselves to" />
          <div className="grid gap-5 md:grid-cols-2">
            {principles.map((p) => (
              <Card key={p.title} className="p-6">
                <h3 className="font-display text-lg tracking-tight">{p.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1240px] px-6 py-16">
        <SectionHeading eyebrow="Faculty" title="Some of the people who teach here" />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {team.map((i) => (
            <Card key={i.id} className="p-5">
              <Avatar initials={i.initials} size="lg" />
              <p className="mt-4 font-medium">{i.name}</p>
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">{i.title}</p>
              <Link to="/instructors/$instructorId" params={{ instructorId: i.id }} className="mt-4 inline-block">
                <Button variant="outline" size="sm">
                  View profile
                </Button>
              </Link>
            </Card>
          ))}
        </div>
      </section>
    </SiteLayout>
  );
}
