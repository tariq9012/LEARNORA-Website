import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/kit";
import { formatShortDate } from "@/lib/format";
import { getMyReportsFn } from "@/server/functions/moderation";
import type { MyReportDto, ReportStatusDto } from "@/server/dto/moderation";

const STATUS: Record<
  ReportStatusDto,
  { label: string; tone: "good" | "warn" | "soft" | "danger" }
> = {
  OPEN: { label: "Open", tone: "warn" },
  IN_REVIEW: { label: "In review", tone: "warn" },
  RESOLVED: { label: "Resolved", tone: "good" },
  DISMISSED: { label: "Dismissed", tone: "soft" },
};

/** The signed-in user's own report history. No admin notes are ever shown here — only status and reason. */
export function MyReportsPanel() {
  const [reports, setReports] = useState<MyReportDto[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void getMyReportsFn().then(
      (r) => !cancelled && setReports(r),
      () => !cancelled && setError("Couldn't load your reports."),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!reports) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (reports.length === 0) {
    return <p className="text-sm text-muted-foreground">You haven't reported anything.</p>;
  }

  return (
    <div className="divide-y divide-line">
      {reports.map((r) => (
        <div key={r.id} className="flex items-center justify-between gap-3 py-3 text-sm">
          <div>
            <p>{r.targetType === "REVIEW" ? "Review" : "Message"} report</p>
            <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
              {r.reason} · {formatShortDate(r.createdAt)}
            </p>
          </div>
          <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
        </div>
      ))}
    </div>
  );
}
