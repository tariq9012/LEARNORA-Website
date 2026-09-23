import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { ShieldCheck, AlertTriangle } from "lucide-react";
import { AuthShell } from "@/components/layout/AuthShell";
import { Button, FormField, Input } from "@/components/ui/kit";
import { resetPasswordFn } from "@/server/functions/auth";

const resetPasswordSearchSchema = z.object({
  token: z.string().optional(),
});

export const Route = createFileRoute("/reset-password")({
  validateSearch: resetPasswordSearchSchema,
  head: () => ({
    meta: [
      { title: "Set a new password — Learnora" },
      { name: "description", content: "Choose a new password for your Learnora account." },
      { property: "og:title", content: "Set a new password — Learnora" },
      { property: "og:description", content: "Choose a new Learnora password." },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { token } = Route.useSearch();
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  return (
    <AuthShell
      eyebrow="Account recovery"
      title="Choose a new password."
      description="Use at least eight characters. You will be signed out of other devices."
      footer={
        <>
          Need help?{" "}
          <Link to="/help" className="text-brand-soft hover:underline">
            Visit the help centre
          </Link>
        </>
      }
    >
      {!token ? (
        <div className="mt-6 rounded-xl bg-panel-2 p-5 ring-1 ring-line">
          <AlertTriangle size={20} className="text-destructive" />
          <p className="mt-3 text-sm font-medium">Missing reset link</p>
          <p className="mt-1 text-sm text-muted-foreground">
            This page needs a reset token from your email link. Request a new one from the forgot
            password page.
          </p>
          <Link to="/forgot-password" className="mt-4 inline-block">
            <Button size="sm">Request a new link</Button>
          </Link>
        </div>
      ) : done ? (
        <div className="mt-6 rounded-xl bg-panel-2 p-5 ring-1 ring-line">
          <ShieldCheck size={20} className="text-good" />
          <p className="mt-3 text-sm font-medium">Password updated</p>
          <p className="mt-1 text-sm text-muted-foreground">
            You can now sign in with your new password.
          </p>
          <Link to="/login" className="mt-4 inline-block">
            <Button size="sm">Go to log in</Button>
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
            const password = data.get("password");
            const confirm = data.get("confirm");
            if (password !== confirm) {
              setError("Passwords do not match.");
              return;
            }

            setSubmitting(true);
            try {
              const result = await resetPasswordFn({
                data: { token, password, confirmPassword: confirm },
              });
              if (!result.success) {
                setError(result.error);
                return;
              }
              setDone(true);
            } catch {
              setError("Something went wrong. Please try again.");
            } finally {
              setSubmitting(false);
            }
          }}
        >
          <FormField label="New password" htmlFor="new-password" hint="At least 8 characters">
            <Input
              id="new-password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
            />
          </FormField>
          <FormField label="Confirm new password" htmlFor="confirm-password" error={error}>
            <Input
              id="confirm-password"
              name="confirm"
              type="password"
              autoComplete="new-password"
              required
            />
          </FormField>
          <Button type="submit" block size="lg" disabled={submitting}>
            {submitting ? "Updating…" : "Update password"}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
