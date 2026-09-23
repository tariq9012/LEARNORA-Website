import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { GraduationCap, Presentation } from "lucide-react";
import { AuthShell, SocialAuthButtons } from "@/components/layout/AuthShell";
import { Button, Checkbox, FormField, Input } from "@/components/ui/kit";
import { roleHomePath } from "@/lib/auth-routes";
import { registerFn } from "@/server/functions/auth";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Create your account — Learnora" },
      {
        name: "description",
        content: "Join Learnora as a student or instructor and start learning today.",
      },
      { property: "og:title", content: "Create your account — Learnora" },
      { property: "og:description", content: "Join 10,000 students learning on Learnora." },
    ],
  }),
  component: RegisterPage,
});

function RegisterPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const [role, setRole] = useState<"STUDENT" | "INSTRUCTOR">("STUDENT");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  return (
    <AuthShell
      eyebrow="Create an account"
      title="Start learning in under a minute."
      description="One account gives you the full catalogue preview, your learning dashboard, wishlists and certificates."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="text-brand-soft hover:underline">
            Log in
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
          setFieldErrors({});

          const data = new FormData(e.currentTarget);
          const password = data.get("password");
          const confirmPassword = data.get("confirm");
          if (password !== confirmPassword) {
            setFieldErrors({ confirmPassword: "Passwords do not match." });
            return;
          }
          if (!data.get("terms")) {
            setError("Please accept the terms to continue.");
            return;
          }

          setSubmitting(true);
          try {
            const result = await registerFn({
              data: {
                name: data.get("name"),
                email: data.get("email"),
                password,
                confirmPassword,
                role,
              },
            });
            if (!result.success) {
              setError(result.error);
              setFieldErrors(result.fieldErrors ?? {});
              return;
            }
            await router.invalidate();
            await navigate({ to: roleHomePath(result.user.role) });
          } catch {
            setError("Something went wrong. Please try again.");
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <FormField
          label="Full name"
          htmlFor="name"
          {...(fieldErrors["name"] && { error: fieldErrors["name"] })}
        >
          <Input id="name" name="name" autoComplete="name" placeholder="Alex Mercer" required />
        </FormField>
        <FormField
          label="Email address"
          htmlFor="reg-email"
          {...(fieldErrors["email"] && { error: fieldErrors["email"] })}
        >
          <Input
            id="reg-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
          />
        </FormField>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            label="Password"
            htmlFor="reg-password"
            hint="At least 8 characters"
            {...(fieldErrors["password"] && { error: fieldErrors["password"] })}
          >
            <Input
              id="reg-password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
            />
          </FormField>
          <FormField
            label="Confirm password"
            htmlFor="confirm"
            {...(fieldErrors["confirmPassword"] && { error: fieldErrors["confirmPassword"] })}
          >
            <Input
              id="confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              required
            />
          </FormField>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">I am joining as</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              {
                id: "STUDENT",
                label: "Student",
                body: "Enrol in courses and track progress",
                icon: GraduationCap,
              },
              {
                id: "INSTRUCTOR",
                label: "Instructor",
                body: "Publish courses and earn revenue",
                icon: Presentation,
              },
            ].map((o) => {
              const Icon = o.icon;
              const active = role === o.id;
              return (
                <button
                  type="button"
                  key={o.id}
                  onClick={() => setRole(o.id as "STUDENT" | "INSTRUCTOR")}
                  aria-pressed={active}
                  className={`rounded-xl p-4 text-left ring-1 transition-colors ${
                    active ? "bg-brand/10 ring-brand/40" : "ring-line hover:ring-brand/30"
                  }`}
                >
                  <Icon size={18} className="text-brand-soft" />
                  <p className="mt-2 text-sm font-medium">{o.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{o.body}</p>
                </button>
              );
            })}
          </div>
        </fieldset>

        {role === "INSTRUCTOR" && (
          <p className="rounded-lg bg-panel-2 p-3 text-xs text-muted-foreground ring-1 ring-line">
            Instructor accounts get access to the instructor dashboard right away. Publishing a
            course still needs admin approval.
          </p>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <label className="flex items-start gap-3 text-sm text-muted-foreground">
          <Checkbox name="terms" className="mt-0.5" />
          <span>
            I agree to the{" "}
            <Link to="/terms" className="text-brand-soft hover:underline">
              terms of service
            </Link>{" "}
            and{" "}
            <Link to="/privacy" className="text-brand-soft hover:underline">
              privacy policy
            </Link>
            .
          </span>
        </label>

        <Button type="submit" block size="lg" disabled={submitting}>
          {submitting ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <SocialAuthButtons />
    </AuthShell>
  );
}
