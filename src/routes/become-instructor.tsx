import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Wallet, Users, PenTool, LifeBuoy } from "lucide-react";
import { SiteLayout, PageHeader } from "@/components/layout/SiteLayout";
import { Button, Card, SectionHeading } from "@/components/ui/kit";

export const Route = createFileRoute("/become-instructor")({
  head: () => ({
    meta: [
      { title: "Teach on Learnora — become an instructor" },
      {
        name: "description",
        content: "Keep 85% of every enrolment, work with an editorial team, and reach 10,000+ engaged learners.",
      },
      { property: "og:title", content: "Teach on Learnora" },
      { property: "og:description", content: "Keep 85% of every enrolment and work with a real editorial team." },
    ],
  }),
  component: BecomeInstructor,
});

const perks = [
  { icon: Wallet, title: "85% revenue share", body: "Paid monthly, with a transparent statement for every enrolment." },
  { icon: PenTool, title: "Editorial support", body: "A subject editor shapes your outline before you record anything." },
  { icon: Users, title: "An engaged audience", body: "10,000+ students who finish courses rather than collect them." },
  { icon: LifeBuoy, title: "Production help", body: "Audio review, caption editing and thumbnail design included." },
];

const steps = [
  { n: "01", t: "Apply", b: "Tell us what you teach and share one sample lesson." },
  { n: "02", t: "Outline review", b: "Work with an editor to sharpen the curriculum." },
  { n: "03", t: "Record", b: "Produce lessons with our guidance and templates." },
  { n: "04", t: "Publish", b: "We handle review, launch and ongoing promotion." },
];

function BecomeInstructor() {
  return (
    <SiteLayout>
      <PageHeader
        eyebrow="Teach"
        title="Your craft is worth teaching properly"
        description="Learnora instructors are working practitioners. If you can explain how you actually do the job, we can help you turn it into a course people finish."
      >
        <div className="flex flex-wrap gap-3">
          <Link to="/register">
            <Button size="lg">
              Apply to teach <ArrowRight size={16} />
            </Button>
          </Link>
          <Link to="/instructor/dashboard">
            <Button variant="outline" size="lg">
              Preview the instructor dashboard
            </Button>
          </Link>
        </div>
      </PageHeader>

      <section className="mx-auto max-w-[1240px] px-6 py-16">
        <SectionHeading eyebrow="Why teach here" title="What you get" />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {perks.map(({ icon: Icon, title, body }) => (
            <Card key={title} className="p-5">
              <Icon size={20} className="text-brand-soft" />
              <h3 className="mt-4 text-base font-medium">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-y border-line bg-panel/40">
        <div className="mx-auto max-w-[1240px] px-6 py-16">
          <SectionHeading eyebrow="Process" title="From application to launch" />
          <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s) => (
              <li key={s.n} className="rounded-xl bg-panel p-5 ring-1 ring-line">
                <span className="font-mono text-[11px] tracking-[0.2em] text-brand-soft">{s.n}</span>
                <h3 className="mt-3 text-base font-medium">{s.t}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.b}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-[1240px] px-6 py-16">
        <Card className="glow flex flex-col items-start gap-6 p-8 lg:flex-row lg:items-center lg:justify-between lg:p-12">
          <div>
            <h2 className="font-display text-3xl tracking-tight">Ready to put your first outline together?</h2>
            <p className="mt-3 max-w-[52ch] text-muted-foreground">
              Applications are reviewed weekly. Most instructors publish their first course within ten weeks.
            </p>
          </div>
          <Link to="/register">
            <Button variant="cream" size="lg">
              Start your application
            </Button>
          </Link>
        </Card>
      </section>
    </SiteLayout>
  );
}
