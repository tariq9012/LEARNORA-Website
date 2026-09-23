import { createFileRoute, Link } from "@tanstack/react-router";
import { CircleCheck, CircleX, ShieldCheck } from "lucide-react";
import { SiteLayout } from "@/components/layout/SiteLayout";
import { Card } from "@/components/ui/kit";
import { formatMonthYear } from "@/lib/format";
import { verifyCertificateFn } from "@/server/functions/certificate";

export const Route = createFileRoute("/certificates/verify/$code")({
  loader: async ({ params }) => ({
    result: await verifyCertificateFn({ data: { code: params.code } }),
    code: params.code,
  }),
  head: ({ loaderData }) => ({
    meta: [{ title: `Verify ${loaderData?.code ?? "certificate"} — Learnora` }],
  }),
  component: VerifyResultPage,
});

function VerifyResultPage() {
  const { result, code } = Route.useLoaderData();

  return (
    <SiteLayout>
      <div className="mx-auto max-w-[560px] px-6 py-20 text-center">
        <ShieldCheck size={36} className="mx-auto text-brand-soft" />
        <h1 className="mt-4 font-display text-3xl tracking-tight">Certificate verification</h1>

        {result.valid ? (
          <Card className="mt-8 space-y-4 p-6 text-left">
            <div className="flex items-center gap-2 text-good">
              <CircleCheck size={18} />
              <span className="font-medium">Valid certificate</span>
            </div>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between border-b border-line pb-2">
                <dt className="text-muted-foreground">Certificate holder</dt>
                <dd>{result.learnerName}</dd>
              </div>
              <div className="flex justify-between border-b border-line pb-2">
                <dt className="text-muted-foreground">Course</dt>
                <dd className="text-right">{result.courseTitle}</dd>
              </div>
              <div className="flex justify-between border-b border-line pb-2">
                <dt className="text-muted-foreground">Instructor</dt>
                <dd>{result.instructorName}</dd>
              </div>
              <div className="flex justify-between border-b border-line pb-2">
                <dt className="text-muted-foreground">Issued</dt>
                <dd>{formatMonthYear(new Date(result.issuedAt))}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Certificate number</dt>
                <dd className="font-mono">{result.certificateCode}</dd>
              </div>
            </dl>
          </Card>
        ) : (
          <Card className="mt-8 p-6">
            <div className="flex items-center justify-center gap-2 text-destructive">
              <CircleX size={18} />
              <span className="font-medium">Certificate not found</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              "{code}" doesn't match any issued certificate. Check the number and try again.
            </p>
          </Card>
        )}

        <Link
          to="/certificates/verify"
          className="mt-6 inline-block text-sm text-brand-soft hover:underline"
        >
          Verify another certificate
        </Link>
      </div>
    </SiteLayout>
  );
}
