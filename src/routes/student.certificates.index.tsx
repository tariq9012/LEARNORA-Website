import { createFileRoute, Link } from "@tanstack/react-router";
import { Award, ExternalLink } from "lucide-react";
import { DashboardLayout, DashboardHeader } from "@/components/layout/DashboardLayout";
import { Button, Card, EmptyState } from "@/components/ui/kit";
import { formatMonthYear } from "@/lib/format";
import { getMyCertificatesFn } from "@/server/functions/certificate";

export const Route = createFileRoute("/student/certificates/")({
  loader: async () => ({ certificates: await getMyCertificatesFn() }),
  head: () => ({
    meta: [
      { title: "Certificates — Learnora" },
      {
        name: "description",
        content: "Download and share the certificates you have earned on Learnora.",
      },
      { property: "og:title", content: "Certificates — Learnora" },
      { property: "og:description", content: "Your earned Learnora certificates." },
    ],
  }),
  component: CertificatesPage,
});

function CertificatesPage() {
  const { certificates } = Route.useLoaderData();

  return (
    <DashboardLayout role="student">
      <DashboardHeader
        title="Certificates"
        description="Every completed course issues a verifiable credential with a public check page."
      />

      {certificates.length === 0 ? (
        <EmptyState
          icon={Award}
          title="No certificates yet"
          description="Finish a course to earn your first verifiable credential."
          action={
            <Link to="/student/learning">
              <Button>Continue learning</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {certificates.map((c) => (
            <Card key={c.id} className="overflow-hidden">
              <div className="glow border-b border-line p-6 text-center">
                <Award size={26} className="mx-auto text-gold" />
                <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Certificate of Completion
                </p>
                <h2 className="mt-2 font-display text-lg leading-snug tracking-tight">
                  {c.courseTitle}
                </h2>
                <p className="mt-3 font-mono text-[10px] text-muted-foreground">
                  {c.certificateCode}
                </p>
              </div>
              <div className="space-y-3 p-5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Instructor</span>
                  <span>{c.instructorName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Issued</span>
                  <span>{formatMonthYear(new Date(c.issuedAt))}</span>
                </div>
                <Link
                  to="/student/certificates/$certificateId"
                  params={{ certificateId: c.id }}
                  className="block pt-2"
                >
                  <Button block size="sm">
                    <ExternalLink size={14} /> View certificate
                  </Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
