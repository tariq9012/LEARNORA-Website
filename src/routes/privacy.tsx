import { createFileRoute } from "@tanstack/react-router";
import { SiteLayout, PageHeader } from "@/components/layout/SiteLayout";
import { LegalBody } from "@/components/layout/LegalBody";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy policy — Learnora" },
      {
        name: "description",
        content: "How Learnora collects, uses and protects student and instructor data.",
      },
      { property: "og:title", content: "Privacy policy — Learnora" },
      { property: "og:description", content: "How Learnora handles your data." },
    ],
  }),
  component: PrivacyPage,
});

const sections = [
  {
    title: "What we collect",
    body: "Account details you provide (name, email, role), learning activity such as lessons completed and quiz results, payment metadata from our processor, and standard technical logs including IP address and device type.",
  },
  {
    title: "How we use it",
    body: "To deliver the courses you enrol in, track progress and issue certificates, provide support, prevent fraud, and improve the catalogue. Aggregate, non-identifying statistics inform which courses we commission next.",
  },
  {
    title: "What we never do",
    body: "We do not sell personal data, and we do not share your learning activity with employers or third parties without an explicit request from you.",
  },
  {
    title: "Cookies",
    body: "We use strictly necessary cookies for sign-in and session integrity, plus first-party analytics cookies that can be declined without losing functionality.",
  },
  {
    title: "Your rights",
    body: "You can export your data, correct it, or request deletion at any time from Settings → Privacy. Deletion removes personal identifiers within thirty days; anonymised course statistics are retained.",
  },
  {
    title: "Retention",
    body: "Account data is kept while your account is open and for twelve months afterwards for tax and dispute purposes. Certificates remain verifiable indefinitely unless you request their withdrawal.",
  },
];

function PrivacyPage() {
  return (
    <SiteLayout>
      <PageHeader
        eyebrow="Legal"
        title="Privacy policy"
        description="Last updated 1 September 2026. This summary is written to be read, not skimmed past."
      />
      <LegalBody sections={sections} />
    </SiteLayout>
  );
}
