import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Award, ArrowLeft, Printer } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/kit";
import { formatMonthYear } from "@/lib/format";
import { getCertificateFn } from "@/server/functions/certificate";

export const Route = createFileRoute("/student/certificates/$certificateId")({
  loader: async ({ params }) => {
    const certificate = await getCertificateFn({ data: { certificateId: params.certificateId } });
    if (!certificate) throw notFound();
    return { certificate };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `${loaderData.certificate.courseTitle} — Certificate` : "Certificate" },
    ],
  }),
  notFoundComponent: () => (
    <DashboardLayout role="student">
      <div className="py-16 text-center">
        <p className="text-lg">Certificate not found.</p>
        <Link to="/student/certificates" className="mt-4 inline-block">
          <Button variant="outline">Back to certificates</Button>
        </Link>
      </div>
    </DashboardLayout>
  ),
  component: CertificateViewPage,
});

function CertificateViewPage() {
  const { certificate: c } = Route.useLoaderData();

  return (
    <DashboardLayout role="student">
      <div className="no-print mb-6 flex items-center justify-between">
        <Link
          to="/student/certificates"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-cream"
        >
          <ArrowLeft size={14} /> Back to certificates
        </Link>
        <Button onClick={() => window.print()}>
          <Printer size={14} /> Print / Save as PDF
        </Button>
      </div>

      <div
        id="certificate-print-area"
        className="mx-auto max-w-[860px] rounded-2xl border-2 border-gold/40 bg-panel p-10 sm:p-16"
      >
        <div className="flex items-center justify-center gap-2">
          <div className="grid size-10 place-items-center rounded-lg bg-brand font-display text-lg text-cream">
            L
          </div>
          <span className="font-display text-xl tracking-tight">Learnora</span>
        </div>

        <div className="mt-10 text-center">
          <Award size={40} className="mx-auto text-gold" />
          <p className="mt-4 font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
            Certificate of Completion
          </p>
          <p className="mt-8 text-sm text-muted-foreground">This certifies that</p>
          <h1 className="mt-2 font-display text-3xl tracking-tight sm:text-4xl">{c.learnerName}</h1>
          <p className="mt-6 text-sm text-muted-foreground">has successfully completed</p>
          <h2 className="mt-2 font-display text-2xl tracking-tight sm:text-3xl text-balance">
            {c.courseTitle}
          </h2>
          <p className="mt-6 text-sm text-muted-foreground">Instructed by {c.instructorName}</p>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-line pt-6 text-center sm:flex-row sm:text-left">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
              Issued
            </p>
            <p className="mt-1 text-sm">{formatMonthYear(new Date(c.issuedAt))}</p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
              Certificate number
            </p>
            <p className="mt-1 font-mono text-sm">{c.certificateCode}</p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
              Verify
            </p>
            <p className="mt-1 text-sm text-brand-soft">/certificates/verify/{c.certificateCode}</p>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          nav, header, aside, footer { display: none !important; }

          /* A certificate should print as a clean, professional
             document regardless of the site's dark theme — browsers
             also strip background colors by default when printing, so
             force the ones that matter (border, badge, logo) to survive
             instead of ending up as bare outlines. */
          html, body { background: #ffffff !important; }

          #certificate-print-area, #certificate-print-area * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color: #1a1a1a !important;
          }

          #certificate-print-area {
            background: #ffffff !important;
            border: 2px solid #c9a24b !important;
            box-shadow: none !important;
            margin: 0 auto;
          }

          #certificate-print-area .text-muted-foreground {
            color: #666666 !important;
          }

          #certificate-print-area .text-gold {
            color: #b8860b !important;
          }

          #certificate-print-area .bg-brand {
            background: #6d28d9 !important;
            color: #ffffff !important;
          }
        }
      `}</style>
    </DashboardLayout>
  );
}
