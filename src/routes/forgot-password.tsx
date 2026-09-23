import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { MailCheck } from "lucide-react";
import { AuthShell } from "@/components/layout/AuthShell";
import { Button, FormField, Input } from "@/components/ui/kit";
import { forgotPasswordFn } from "@/server/functions/auth";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset your password — Learnora" },
      { name: "description", content: "Request a password reset link for your Learnora account." },
      { property: "og:title", content: "Reset your password — Learnora" },
      { property: "og:description", content: "Request a Learnora password reset link." },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  return (
    <AuthShell
      eyebrow="Account recovery"
      title="Forgotten passwords happen."
      description="Enter the email you signed up with and we will send a link to set a new password. The link expires after one hour."
      footer={
        <>
          Remembered it?{" "}
          <Link to="/login" className="text-brand-soft hover:underline">
            Back to log in
          </Link>
        </>
      }
    >
      {sent ? (
        <div className="mt-6 rounded-xl bg-panel-2 p-5 ring-1 ring-line">
          <MailCheck size={20} className="text-good" />
          <p className="mt-3 text-sm font-medium">Check your inbox</p>
          <p className="mt-1 text-sm text-muted-foreground">
            If an account exists for that address, a reset link is on its way. In this preview build
            no email is actually sent — see the server console for the link during development.
          </p>
          <Link to="/reset-password" className="mt-4 inline-block">
            <Button variant="outline" size="sm">
              Open reset form
            </Button>
          </Link>
        </div>
      ) : (
        <form
          className="mt-6 space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (submitting) return;
            setError("");

            const data = new FormData(e.currentTarget);
            setSubmitting(true);
            try {
              const result = await forgotPasswordFn({ data: { email: data.get("email") } });
              if (!result.success) {
                setError(result.error);
                return;
              }
              setSent(true);
            } catch {
              setError("Something went wrong. Please try again.");
            } finally {
              setSubmitting(false);
            }
          }}
        >
          <FormField label="Email address" htmlFor="recover-email" error={error}>
            <Input
              id="recover-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
            />
          </FormField>
          <Button type="submit" block size="lg" disabled={submitting}>
            {submitting ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
