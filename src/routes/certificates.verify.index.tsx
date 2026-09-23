import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { SiteLayout } from "@/components/layout/SiteLayout";
import { Button, Card, Input } from "@/components/ui/kit";

export const Route = createFileRoute("/certificates/verify/")({
  head: () => ({
    meta: [
      { title: "Verify a certificate — Learnora" },
      {
        name: "description",
        content: "Check whether a Learnora certificate number is genuine.",
      },
    ],
  }),
  component: VerifyIndexPage,
});

function VerifyIndexPage() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");

  return (
    <SiteLayout>
      <div className="mx-auto max-w-[560px] px-6 py-20 text-center">
        <ShieldCheck size={36} className="mx-auto text-brand-soft" />
        <h1 className="mt-4 font-display text-3xl tracking-tight">Verify a certificate</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Enter the certificate number exactly as it appears on the credential, e.g.
          LRN-2026-A1B2C3D4E5.
        </p>
        <form
          className="mt-8 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = code.trim();
            if (trimmed)
              void navigate({ to: "/certificates/verify/$code", params: { code: trimmed } });
          }}
        >
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="LRN-2026-XXXXXXXXXX"
            className="flex-1"
          />
          <Button type="submit">Verify</Button>
        </form>
      </div>
    </SiteLayout>
  );
}
