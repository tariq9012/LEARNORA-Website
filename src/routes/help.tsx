import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { SiteLayout, PageHeader } from "@/components/layout/SiteLayout";
import { Button, Card, SearchBar } from "@/components/ui/kit";

export const Route = createFileRoute("/help")({
  head: () => ({
    meta: [
      { title: "Help centre — Learnora" },
      {
        name: "description",
        content: "Answers on enrolment, refunds, certificates, accounts and instructor payouts.",
      },
      { property: "og:title", content: "Help centre — Learnora" },
      {
        property: "og:description",
        content: "Answers to the questions students and instructors ask most.",
      },
    ],
  }),
  component: HelpPage,
});

const faqs = [
  {
    q: "How long do I have access to a course?",
    a: "Enrolment is a one-time payment and access does not expire. That includes every future revision of the course, at no extra cost.",
  },
  {
    q: "What is the refund policy?",
    a: "Any course can be refunded within thirty days of enrolment, provided you have completed less than half of the lessons. Refunds are returned to the original payment method within five working days.",
  },
  {
    q: "Are certificates verifiable?",
    a: "Yes. Each certificate carries a credential ID and a public verification page that employers can check without an account.",
  },
  {
    q: "Can I download lessons for offline study?",
    a: "Lessons and attached resources can be downloaded from the course player for offline use on any device signed in to your account.",
  },
  {
    q: "How do instructor payouts work?",
    a: "Every paid enrolment creates an earning for the instructor. Once the available balance reaches the minimum payout, the instructor requests a payout from the Earnings page and an admin reviews it. Refunded sales are reversed.",
  },
  {
    q: "Do you offer team or company accounts?",
    a: "Team plans cover five seats or more with consolidated billing and a shared progress dashboard. Contact the team for a quote.",
  },
];

function HelpPage() {
  const [open, setOpen] = useState<string | null>(faqs[0]?.q ?? null);

  return (
    <SiteLayout>
      <PageHeader
        eyebrow="Support"
        title="Help centre"
        description="Most questions are answered below. If yours is not, the support team replies within one working day."
      >
        <SearchBar className="max-w-[520px]" placeholder="Search help articles" />
      </PageHeader>

      <section className="mx-auto max-w-[860px] px-6 py-14">
        <div className="space-y-3">
          {faqs.map((f) => {
            const expanded = open === f.q;
            return (
              <Card key={f.q} className="overflow-hidden">
                <button
                  onClick={() => setOpen(expanded ? null : f.q)}
                  aria-expanded={expanded}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-panel-2/60"
                >
                  <span className="flex-1 font-medium">{f.q}</span>
                  <ChevronDown
                    size={16}
                    className={`text-brand-soft transition-transform ${expanded ? "" : "-rotate-90"}`}
                  />
                </button>
                {expanded && (
                  <p className="border-t border-line px-5 py-4 text-sm leading-relaxed text-muted-foreground">
                    {f.a}
                  </p>
                )}
              </Card>
            );
          })}
        </div>

        <Card className="mt-10 flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <h2 className="font-display text-lg tracking-tight">Still stuck?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Send us the details and we will pick it up from there.
            </p>
          </div>
          <Link to="/contact">
            <Button>Contact support</Button>
          </Link>
        </Card>
      </section>
    </SiteLayout>
  );
}
