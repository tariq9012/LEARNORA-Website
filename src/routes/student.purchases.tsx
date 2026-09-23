import { createFileRoute, Link } from "@tanstack/react-router";
import { Receipt } from "lucide-react";
import { DashboardLayout, DashboardHeader } from "@/components/layout/DashboardLayout";
import { Button, Card, EmptyState, StatusBadge } from "@/components/ui/kit";
import { currency } from "@/data/mock";
import { formatMonthYear } from "@/lib/format";
import { getMyPurchasesFn } from "@/server/functions/checkout";
import type { PurchaseHistoryItemDTO } from "@/server/dto/checkout";

export const Route = createFileRoute("/student/purchases")({
  loader: async () => ({ purchases: await getMyPurchasesFn() }),
  head: () => ({
    meta: [
      { title: "Purchases — Learnora" },
      { name: "description", content: "Your Learnora order and purchase history." },
    ],
  }),
  component: PurchasesPage,
});

const STATUS_LABEL: Record<PurchaseHistoryItemDTO["status"], string> = {
  PENDING: "Pending",
  PAID: "Completed",
  FAILED: "Failed",
  REFUNDED: "Refunded",
  PARTIALLY_REFUNDED: "Partially refunded",
};

function PurchasesPage() {
  const { purchases } = Route.useLoaderData();

  return (
    <DashboardLayout role="student">
      <DashboardHeader title="Purchases" description="Every order you've placed on Learnora." />

      {purchases.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No purchases yet"
          description="Courses you buy will show up here with their order reference and status."
          action={
            <Link to="/courses">
              <Button>Browse courses</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {purchases.map((p) => (
            <Card key={p.orderId} className="flex flex-wrap items-center justify-between gap-4 p-4">
              <div>
                <p className="font-medium">{p.courseTitle}</p>
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                  {p.orderNumber} · {formatMonthYear(new Date(p.createdAt))}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <StatusBadge status={STATUS_LABEL[p.status]} />
                <span className="font-medium">{currency(p.amount)}</span>
                {p.status === "PAID" && (
                  <Link
                    to="/checkout/success/$orderId"
                    params={{ orderId: p.orderId }}
                    className="text-sm text-brand-soft hover:underline"
                  >
                    View
                  </Link>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
