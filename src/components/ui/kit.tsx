import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Star, Search, X, Inbox } from "lucide-react";

/* ------------------------------- Button -------------------------------- */

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-colors duration-200 disabled:opacity-50 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        primary: "bg-brand text-ink hover:bg-brand-soft",
        cream: "bg-cream text-ink hover:bg-white",
        outline: "ring-1 ring-line text-cream hover:ring-brand/50 hover:text-brand-soft",
        ghost: "text-muted-foreground hover:text-cream hover:bg-panel-2",
        subtle: "bg-panel-2 text-cream ring-1 ring-line hover:ring-brand/40",
        destructive: "bg-destructive text-destructive-foreground hover:opacity-90",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-6 text-[15px]",
        icon: "size-9",
      },
      block: { true: "w-full", false: "" },
    },
    defaultVariants: { variant: "primary", size: "md", block: false },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, block, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size, block }), className)} {...props} />;
}

/* -------------------------------- Card --------------------------------- */

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl bg-panel ring-1 ring-line", className)} {...props} />;
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}

/* -------------------------------- Badge -------------------------------- */

const badgeVariants = cva("inline-flex items-center rounded-md font-mono text-[10px] px-2 py-1 tracking-wide", {
  variants: {
    tone: {
      brand: "bg-brand text-ink font-medium",
      neutral: "bg-ink/70 text-cream ring-1 ring-line",
      good: "bg-good/15 text-good ring-1 ring-good/30",
      warn: "bg-warn/15 text-warn ring-1 ring-warn/30",
      danger: "bg-destructive/15 text-destructive ring-1 ring-destructive/30",
      soft: "bg-panel-2 text-muted-foreground ring-1 ring-line",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "Published" || status === "Active" || status === "Completed"
      ? "good"
      : status === "Draft" || status === "Scheduled" || status === "Expired"
        ? "soft"
        : status === "Rejected" || status === "Suspended" || status === "Flagged"
          ? "danger"
          : "warn";
  return <Badge tone={tone}>{status}</Badge>;
}

/* ------------------------------- Avatar -------------------------------- */

export function Avatar({
  initials,
  size = "md",
  className,
}: {
  initials: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const sizes = {
    sm: "size-8 text-[11px]",
    md: "size-10 text-xs",
    lg: "size-14 text-sm",
    xl: "size-20 text-lg",
  };
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-panel-2 ring-1 ring-line font-display text-brand-soft",
        sizes[size],
        className,
      )}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

/* ------------------------------- Rating -------------------------------- */

export function Rating({
  value,
  count,
  className,
  showValue = true,
}: {
  value: number;
  count?: number;
  className?: string;
  showValue?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm", className)}>
      <span className="flex text-gold" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} size={14} className={i < Math.round(value) ? "fill-gold" : "opacity-25"} />
        ))}
      </span>
      {showValue && <span className="font-medium">{value.toFixed(1)}</span>}
      {count !== undefined && <span className="text-muted-foreground">({count.toLocaleString()})</span>}
      <span className="sr-only">{value} out of 5 stars</span>
    </span>
  );
}

/* ----------------------------- ProgressBar ------------------------------ */

export function ProgressBar({
  value,
  className,
  label,
}: {
  value: number;
  className?: string;
  label?: string;
}) {
  return (
    <div className={className}>
      {label && (
        <div className="mb-2 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
          <span>{label}</span>
          <span className="text-cream">{value}%</span>
        </div>
      )}
      <div
        className="h-1.5 overflow-hidden rounded-full bg-ink"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "Progress"}
      >
        <div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

/* ------------------------------- StatCard ------------------------------- */

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{label}</p>
        {Icon && <Icon size={16} className="text-brand-soft" />}
      </div>
      <p className="mt-2 font-display text-3xl tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}

/* ----------------------------- SectionHeading --------------------------- */

export function SectionHeading({
  eyebrow,
  title,
  action,
  className,
}: {
  eyebrow?: string;
  title: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-8 flex flex-wrap items-end justify-between gap-4", className)}>
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2 className="mt-3 font-display text-3xl tracking-tight">{title}</h2>
      </div>
      {action}
    </div>
  );
}

/* ------------------------------ FormField ------------------------------- */

let fieldSeq = 0;

export function FormField({
  label,
  hint,
  error,
  children,
  className,
  htmlFor,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-cream">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export const inputClass =
  "w-full rounded-lg bg-panel-2 ring-1 ring-line px-3.5 py-2.5 text-sm text-cream placeholder:text-muted-foreground/70 outline-none focus:ring-brand/60 transition";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputClass, className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(inputClass, "min-h-28 resize-y", className)} {...props} />;
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(inputClass, "appearance-none pr-8", className)} {...props} />;
}

export function Checkbox({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="checkbox"
      className={cn("size-4 shrink-0 rounded-sm accent-[hsl(258_78%_66%)]", className)}
      {...props}
    />
  );
}

export function useFieldId(prefix: string) {
  const [id] = React.useState(() => `${prefix}-${++fieldSeq}`);
  return id;
}

/* ------------------------------- SearchBar ------------------------------ */

export function SearchBar({
  placeholder = "Search courses, topics or instructors",
  value,
  onChange,
  onSubmit,
  cta,
  className,
}: {
  placeholder?: string;
  value?: string;
  onChange?: (v: string) => void;
  onSubmit?: (v: string) => void;
  cta?: string;
  className?: string;
}) {
  const [internal, setInternal] = React.useState("");
  const controlled = value !== undefined;
  const v = controlled ? value : internal;
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.(v ?? "");
      }}
      className={cn(
        "flex items-center gap-2 rounded-xl bg-panel p-1.5 ring-1 ring-line transition focus-within:ring-brand/50",
        className,
      )}
    >
      <Search size={18} className="ml-2.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <input
        type="search"
        aria-label={placeholder}
        placeholder={placeholder}
        value={v}
        onChange={(e) => (controlled ? onChange?.(e.target.value) : setInternal(e.target.value))}
        className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none placeholder:text-muted-foreground/70"
      />
      {cta && (
        <Button type="submit" size="md">
          {cta}
        </Button>
      )}
    </form>
  );
}

/* -------------------------------- Modal --------------------------------- */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-ink/80 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-lg rounded-2xl bg-panel p-6 ring-1 ring-line shadow-2xl animate-rise"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-xl tracking-tight">{title}</h2>
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
          <button onClick={onClose} aria-label="Close dialog" className="rounded-md p-1 text-muted-foreground hover:text-cream">
            <X size={18} />
          </button>
        </div>
        {children && <div className="mt-5">{children}</div>}
        {footer && <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

/* ------------------------------ EmptyState ------------------------------ */

export function EmptyState({
  title,
  description,
  action,
  icon: Icon = Inbox,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <Card className="grid place-items-center px-6 py-16 text-center">
      <span className="grid size-12 place-items-center rounded-xl bg-panel-2 text-brand-soft ring-1 ring-line">
        <Icon size={20} />
      </span>
      <h3 className="mt-4 font-display text-lg">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </Card>
  );
}

/* ------------------------------ DataTable ------------------------------- */

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  className?: string;
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  empty = "Nothing to show yet.",
  caption,
}: {
  columns: Column<T>[];
  rows: T[];
  empty?: string;
  caption?: string;
}) {
  if (rows.length === 0) {
    return (
      <Card className="px-6 py-12 text-center text-sm text-muted-foreground">{empty}</Card>
    );
  }
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr className="border-b border-line">
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn(
                    "px-5 py-3.5 text-left font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground",
                    c.className,
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-line last:border-0 transition-colors hover:bg-panel-2/60">
                {columns.map((c) => (
                  <td key={c.key} className={cn("px-5 py-4 align-middle", c.className)}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* --------------------------------- Tabs --------------------------------- */

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-line" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={active === t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm transition-colors",
            active === t.id
              ? "border-brand text-cream"
              : "border-transparent text-muted-foreground hover:text-cream",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
