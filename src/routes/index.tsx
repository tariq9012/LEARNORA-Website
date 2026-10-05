import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeCheck,
  Clock3,
  Hammer,
  Infinity as InfinityIcon,
  Award,
  Compass,
  UserPlus,
  PlayCircle,
  Trophy,
} from "lucide-react";
import { SiteLayout } from "@/components/layout/SiteLayout";
import {
  Button,
  Card,
  ProgressBar,
  Rating,
  SearchBar,
  SectionHeading,
  Avatar,
} from "@/components/ui/kit";
import { CourseCard } from "@/components/course/CourseCard";
import { CategoryCard } from "@/components/course/CategoryCard";
import { compact } from "@/lib/format";
import {
  getCategoriesFn,
  getFeaturedCoursesFn,
  getPlatformStatsFn,
} from "@/server/functions/catalog";
import { heroStudy } from "@/lib/course-images";

export const Route = createFileRoute("/")({
  loader: async () => {
    const [categories, featured, stats] = await Promise.all([
      getCategoriesFn(),
      getFeaturedCoursesFn({ data: {} }),
      getPlatformStatsFn(),
    ]);
    return { categories, featured, stats };
  },
  head: () => ({
    meta: [
      { title: "Learnora — Learn deeply. Build what endures." },
      {
        name: "description",
        content:
          "A curated catalogue of practitioner-led courses in software, data and design. Learn at your own pace and earn certificates that matter.",
      },
      { property: "og:title", content: "Learnora — Learn deeply. Build what endures." },
      {
        property: "og:description",
        content:
          "Practitioner-led courses in software, data and design, taught with the rigour of a university press.",
      },
    ],
  }),
  component: Home,
});

const benefits = [
  {
    icon: BadgeCheck,
    title: "Learn from practitioners",
    body: "Every instructor teaches work they still do professionally.",
  },
  {
    icon: Clock3,
    title: "Your own pace",
    body: "Lifetime access to every lesson, exercise and update.",
  },
  {
    icon: Hammer,
    title: "Practical projects",
    body: "Leave each course with portfolio work, not just notes.",
  },
  {
    icon: Award,
    title: "Verified certificates",
    body: "Shareable credentials with a public verification page.",
  },
  {
    icon: InfinityIcon,
    title: "Lifetime updates",
    body: "Courses are revised as the tools and practices change.",
  },
  {
    icon: PlayCircle,
    title: "Offline-friendly",
    body: "Download lessons and resources for study without a connection.",
  },
];

const steps = [
  {
    n: "01",
    title: "Find a course",
    body: "Search the catalogue or browse by discipline and level.",
  },
  { n: "02", title: "Enrol", body: "One payment, lifetime access, thirty-day refund window." },
  { n: "03", title: "Learn", body: "Work through lessons and projects at whatever pace fits." },
  {
    n: "04",
    title: "Earn your certificate",
    body: "Finish the curriculum and receive a verified credential.",
  },
];

function Home() {
  const navigate = useNavigate();
  const { categories, featured, stats } = Route.useLoaderData();

  return (
    <SiteLayout>
      {/* Hero */}
      <header className="glow relative border-b border-line">
        <div className="mx-auto grid max-w-[1240px] items-center gap-12 px-6 py-16 lg:grid-cols-12 lg:py-24">
          <div className="lg:col-span-7">
            <p className="eyebrow animate-rise">The modern learning register</p>
            <h1 className="mt-5 animate-rise font-display text-[clamp(2.6rem,6.5vw,4.5rem)] font-medium leading-[0.98] tracking-tight text-balance">
              Learn deeply.
              <br />
              <span className="italic text-brand-soft">Build what endures.</span>
            </h1>
            <p className="mt-6 max-w-[52ch] animate-rise text-lg leading-relaxed text-pretty text-muted-foreground">
              A curated catalogue of practitioner-led courses in software, data and design — taught
              with the rigour of a university press and the pace of a working studio.
            </p>

            <SearchBar
              className="mt-8 max-w-[520px] animate-rise"
              placeholder="Search 480+ courses, topics or instructors"
              cta="Search"
              onSubmit={(q) => navigate({ to: "/courses", search: { q: q || undefined } })}
            />

            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/courses">
                <Button size="lg">
                  Browse courses <ArrowRight size={16} />
                </Button>
              </Link>
              <Link to="/categories">
                <Button variant="outline" size="lg">
                  <Compass size={16} /> Explore categories
                </Button>
              </Link>
            </div>
          </div>

          <div className="animate-rise lg:col-span-5">
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Continue learning
                </span>
                <span className="font-mono text-[10px] text-brand-soft">Week 6</span>
              </div>
              <img
                src={heroStudy}
                alt="A laptop and notebook on a desk lit by a lamp at night"
                width={1024}
                height={576}
                className="mt-4 aspect-video w-full rounded-xl object-cover"
              />
              <div className="mt-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-brand-soft">
                  Data Science
                </p>
                <p className="mt-1 text-[15px] font-medium leading-snug">
                  Statistical Thinking &amp; Inference
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">Dr. Amara Nwosu</p>
              </div>
              <ProgressBar value={62} label="Progress" className="mt-4" />
              <Link
                to="/student/course/$courseId"
                params={{ courseId: "statistical-thinking" }}
                className="mt-5 block"
              >
                <Button variant="cream" block>
                  Resume lesson
                </Button>
              </Link>
            </Card>
          </div>
        </div>
      </header>

      {/* Categories */}
      <section className="mx-auto max-w-[1240px] px-6 py-16 lg:py-20">
        <SectionHeading
          eyebrow="01 / Catalogue"
          title="Browse by discipline"
          action={
            <Link
              to="/categories"
              className="hidden text-sm text-muted-foreground transition-colors hover:text-cream sm:inline"
            >
              All categories →
            </Link>
          }
        />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {categories.map((c) => (
            <CategoryCard key={c.id} category={c} />
          ))}
        </div>
      </section>

      {/* Featured */}
      <section className="mx-auto max-w-[1240px] px-6 pb-20">
        <SectionHeading
          eyebrow="02 / Featured"
          title="Curated this season"
          action={
            <Link
              to="/courses"
              className="hidden text-sm text-muted-foreground transition-colors hover:text-cream sm:inline"
            >
              View all →
            </Link>
          }
        />
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {featured.length > 0 ? (
            featured.map((c) => <CourseCard key={c.id} course={c} />)
          ) : (
            <p className="text-sm text-muted-foreground">
              No featured courses right now — check back soon.
            </p>
          )}
        </div>
      </section>

      {/* Why Learnora */}
      <section className="border-y border-line bg-panel/40">
        <div className="mx-auto max-w-[1240px] px-6 py-16 lg:py-20">
          <SectionHeading eyebrow="03 / Why Learnora" title="Built for people who finish" />
          <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {benefits.map(({ icon: Icon, title, body }) => (
              <div key={title}>
                <span className="grid size-10 place-items-center rounded-lg bg-panel-2 text-brand-soft ring-1 ring-line">
                  <Icon size={18} />
                </span>
                <h3 className="mt-4 text-base font-medium">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-[1240px] px-6 py-16 lg:py-20">
        <SectionHeading eyebrow="04 / How it works" title="Four steps, no ceremony" />
        <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s) => (
            <li key={s.n} className="rounded-xl bg-panel p-5 ring-1 ring-line">
              <span className="font-mono text-[11px] tracking-[0.2em] text-brand-soft">{s.n}</span>
              <h3 className="mt-3 text-base font-medium">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Stats */}
      <section className="border-y border-line bg-panel/40">
        <div className="mx-auto grid max-w-[1240px] grid-cols-2 gap-8 px-6 py-14 lg:grid-cols-4">
          {[
            { v: compact(stats.activeStudents), l: "Active students" },
            { v: compact(stats.publishedCourses), l: "Published courses" },
            { v: compact(stats.instructors), l: "Instructors" },
            { v: compact(stats.lessonsCompleted), l: "Lessons completed" },
          ].map((s, i) => (
            <div
              key={s.l}
              className={`border-l-2 pl-4 ${i === 0 ? "border-brand/60" : "border-brand/40"}`}
            >
              <p className="font-display text-3xl tracking-tight">{s.v}</p>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                {s.l}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Instructor CTA */}
      <section className="mx-auto max-w-[1240px] px-6 pb-20">
        <Card className="glow flex flex-col items-start gap-8 p-8 lg:flex-row lg:items-center lg:justify-between lg:p-12">
          <div className="max-w-xl">
            <p className="eyebrow">06 / Teach</p>
            <h2 className="mt-4 font-display text-3xl tracking-tight lg:text-4xl">
              Your craft is worth teaching properly.
            </h2>
            <p className="mt-4 leading-relaxed text-muted-foreground">
              Learnora instructors earn a transparent share of every enrolment, own their audience,
              and get an editorial team that helps shape the curriculum before a single lesson is
              recorded.
            </p>
            <div className="mt-6 flex flex-wrap gap-6 font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
              <span className="flex items-center gap-2">
                <Trophy size={14} className="text-brand-soft" /> Transparent revenue share
              </span>
              <span className="flex items-center gap-2">
                <UserPlus size={14} className="text-brand-soft" /> 112 instructors
              </span>
            </div>
          </div>
          <Link to="/become-instructor" className="shrink-0">
            <Button variant="cream" size="lg">
              Become an instructor <ArrowRight size={16} />
            </Button>
          </Link>
        </Card>
      </section>
    </SiteLayout>
  );
}
