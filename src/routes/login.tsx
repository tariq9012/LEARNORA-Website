import { sanitizeInternalPath } from "@/lib/safe-path";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { AuthShell, SocialAuthButtons } from "@/components/layout/AuthShell";
import { Button, Checkbox, FormField, Input } from "@/components/ui/kit";
import { roleHomePath } from "@/lib/auth-routes";
import { loginFn } from "@/server/functions/auth";

const loginSearchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/login")({
  validateSearch: loginSearchSchema,
  head: () => ({
    meta: [
      { title: "Log in — Learnora" },
      { name: "description", content: "Sign in to your Learnora account to continue learning." },
      { property: "og:title", content: "Log in — Learnora" },
      { property: "og:description", content: "Sign in to continue your Learnora courses." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const { redirect: redirectTo } = Route.useSearch();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Pick up where you left off."
      description="Your progress, notes and certificates are waiting. Sign in to continue any course on any device."
      footer={
        <>
          New to Learnora?{" "}
          <Link to="/register" className="text-brand-soft hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form
        className="mt-6 space-y-5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (submitting) return;
          setError("");

          const data = new FormData(e.currentTarget);
          const email = data.get("email");
          const password = data.get("password");
          if (!email || !password) {
            setError("Enter your email and password to continue.");
            return;
          }

          setSubmitting(true);
          try {
            const result = await loginFn({ data: { email, password } });
            if (!result.success) {
              setError(result.error);
              return;
            }
            // The root route's beforeLoad reads the session on the server;
            // invalidate so it re-runs and the whole app sees the new
            // logged-in state (navbar, guards) before we navigate.
            await router.invalidate();
            // Only same-origin absolute paths are followed (open-redirect guard).
            await navigate({
              to: sanitizeInternalPath(redirectTo) ?? roleHomePath(result.user.role),
            });
          } catch {
            setError("Something went wrong. Please try again.");
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <FormField label="Email address" htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
          />
        </FormField>
        <FormField label="Password" htmlFor="password" error={error}>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
          />
        </FormField>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox name="remember" defaultChecked /> Remember me
          </label>
          <Link to="/forgot-password" className="text-sm text-brand-soft hover:underline">
            Forgot password?
          </Link>
        </div>

        <Button type="submit" block size="lg" disabled={submitting}>
          {submitting ? "Logging in…" : "Log in"}
        </Button>
      </form>

      <SocialAuthButtons />
    </AuthShell>
  );
}
