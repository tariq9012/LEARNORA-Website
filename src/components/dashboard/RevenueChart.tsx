import { Card, currencyLabel } from "@/components/dashboard/chart-utils";

export function RevenueChart({
  title = "Revenue overview",
  subtitle = "Last six months",
  data,
}: {
  title?: string;
  subtitle?: string;
  /** Real grouped data from the caller — never a default/fake series. See admin-dashboard-service.ts / earnings-service.ts's monthly-bucket helpers. */
  data: { month: string; value: number }[];
}) {
  // Floor of 1 so an all-zero series (a brand-new instructor) renders flat bars instead of NaN heights.
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((n, d) => n + d.value, 0);

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="font-display text-lg tracking-tight">{title}</h3>
          <p className="font-mono text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
        <p className="font-display text-2xl">{currencyLabel(total)}</p>
      </div>

      <div className="mt-6 flex h-48 items-end gap-2 sm:gap-4">
        {data.map((d) => (
          <div key={d.month} className="flex flex-1 flex-col items-center gap-2">
            <span className="font-mono text-[10px] text-muted-foreground">
              {currencyLabel(d.value)}
            </span>
            <div
              className="w-full rounded-t-md bg-gradient-to-t from-brand/30 to-brand transition-all duration-500"
              style={{ height: `${(d.value / max) * 100}%` }}
              role="img"
              aria-label={`${d.month}: ${currencyLabel(d.value)}`}
            />
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
              {d.month}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
