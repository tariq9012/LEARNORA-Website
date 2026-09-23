import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Logo } from "@/components/layout/Logo";
import { Card } from "@/components/ui/kit";

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="glow min-h-screen">
      <div className="mx-auto flex max-w-[1240px] items-center justify-between px-6 py-6">
        <Logo />
        <Link to="/courses" className="text-sm text-muted-foreground transition-colors hover:text-cream">
          Browse courses
        </Link>
      </div>

      <div className="mx-auto grid max-w-[1240px] items-center gap-12 px-6 pb-20 pt-8 lg:grid-cols-2">
        <div className="hidden lg:block">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="mt-5 max-w-[16ch] font-display text-5xl leading-[1.02] tracking-tight text-balance">{title}</h1>
          <p className="mt-6 max-w-[46ch] leading-relaxed text-pretty text-muted-foreground">{description}</p>
          <dl className="mt-10 grid grid-cols-3 gap-6">
            {[
              ["10,000+", "Students"],
              ["480", "Courses"],
              ["4.8", "Avg. rating"],
            ].map(([v, l]) => (
              <div key={l} className="border-l-2 border-brand/40 pl-4">
                <dt className="font-display text-2xl">{v}</dt>
                <dd className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{l}</dd>
              </div>
            ))}
          </dl>
        </div>

        <Card className="w-full p-6 sm:p-8">
          <div className="lg:hidden">
            <p className="eyebrow">{eyebrow}</p>
          </div>
          <h2 className="mt-3 font-display text-2xl tracking-tight lg:mt-0">{title}</h2>
          {children}
          {footer && <div className="mt-6 border-t border-line pt-5 text-sm text-muted-foreground">{footer}</div>}
        </Card>
      </div>
    </div>
  );
}

export function SocialAuthButtons() {
  return (
    <div className="mt-6">
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-line" />
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">or continue with</span>
        <span className="h-px flex-1 bg-line" />
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          className="flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm ring-1 ring-line transition-colors hover:ring-brand/40"
        >
          <span className="font-display text-base text-brand-soft">G</span> Google
        </button>
        <button
          type="button"
          className="flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm ring-1 ring-line transition-colors hover:ring-brand/40"
        >
          <span className="font-display text-base text-brand-soft">◉</span> GitHub
        </button>
      </div>
    </div>
  );
}
