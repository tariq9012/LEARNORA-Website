import { createFileRoute } from "@tanstack/react-router";
import { SiteLayout, PageHeader } from "@/components/layout/SiteLayout";
import { LegalBody } from "@/components/layout/LegalBody";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of service — Learnora" },
      {
        name: "description",
        content: "The agreement covering Learnora accounts, enrolments, refunds and content.",
      },
      { property: "og:title", content: "Terms of service — Learnora" },
      {
        property: "og:description",
        content: "Accounts, enrolments, refunds and content licensing on Learnora.",
      },
    ],
  }),
  component: TermsPage,
});

const sections = [
  {
    title: "Your account",
    body: "You are responsible for keeping your credentials secure and for activity under your account. Accounts are personal; sharing sign-in details across a team requires a team plan.",
  },
  {
    title: "Enrolment and access",
    body: "Enrolment grants a personal, non-transferable licence to view course materials for as long as the course remains on the platform, including all future revisions.",
  },
  {
    title: "Refunds",
    body: "Courses may be refunded within thirty days of purchase where fewer than half the lessons have been completed. Repeated refund requests across many courses may result in the right being withdrawn.",
  },
  {
    title: "Instructor content",
    body: "Instructors retain copyright in their material and grant Learnora a licence to host, stream and promote it. Instructors warrant that they hold the rights to everything they upload.",
  },
  {
    title: "Acceptable use",
    body: "Downloading lessons for offline personal study is permitted. Redistributing, reselling or publicly reposting course materials is not, and results in account termination without refund.",
  },
  {
    title: "Changes to these terms",
    body: "Material changes are announced by email at least thirty days before they take effect. Continued use after that date constitutes acceptance.",
  },
];

function TermsPage() {
  return (
    <SiteLayout>
      <PageHeader
        eyebrow="Legal"
        title="Terms of service"
        description="Last updated 1 September 2026. Plain-language terms covering accounts, enrolments and content."
      />
      <LegalBody sections={sections} />
    </SiteLayout>
  );
}
