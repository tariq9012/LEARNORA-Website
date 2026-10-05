import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { CircleCheck } from "lucide-react";
import { SiteLayout } from "@/components/layout/SiteLayout";
import { Button, Card } from "@/components/ui/kit";
import { formatMoney, formatMonthYear } from "@/lib/format";
import { getMyOrderFn } from "@/server/functions/checkout";

export const Route = createFileRoute("/checkout/success/$orderId")({
  loader: async ({ params }) => {
    const order = await getMyOrderFn({ data: { orderId: params.orderId } });
    if (!order) throw notFound();
    return { order };
  },
  head: () => ({ meta: [{ title: "Purchase complete — Learnora" }] }),
  notFoundComponent: () => (
    <SiteLayout>
      <div className="mx-auto max-w-[520px] px-6 py-24 text-center">
        <p className="text-lg">Order not found.</p>
        <Link to="/student/purchases" className="mt-4 inline-block">
          <Button variant="outline">View your purchases</Button>
        </Link>
      </div>
    </SiteLayout>
  ),
  component: CheckoutSuccessPage,
});

function CheckoutSuccessPage() {
  const { order } = Route.useLoaderData();

  // Refreshing this page must never re-charge anything — it only ever
  // reads the order's already-committed state (getMyOrderFn is a plain
  // GET/read), so a reload is always safe.
  const isPaid = order.status === "PAID";

  return (
    <SiteLayout>
      <div className="mx-auto max-w-[520px] px-6 py-20 text-center">
        {isPaid ? (
          <>
            <CircleCheck size={40} className="mx-auto text-good" />
            <h1 className="mt-4 font-display text-3xl tracking-tight">Payment successful</h1>
          </>
        ) : (
          <h1 className="mt-4 font-display text-3xl tracking-tight">Order {order.status}</h1>
        )}

        <Card className="mt-8 space-y-3 p-6 text-left text-sm">
          <div className="flex justify-between border-b border-line pb-2">
            <span className="text-muted-foreground">Course</span>
            <span className="text-right">{order.courseTitle}</span>
          </div>
          <div className="flex justify-between border-b border-line pb-2">
            <span className="text-muted-foreground">Amount</span>
            <span>{formatMoney(order.amount)}</span>
          </div>
          <div className="flex justify-between border-b border-line pb-2">
            <span className="text-muted-foreground">Order reference</span>
            <span className="font-mono">{order.orderNumber}</span>
          </div>
          <div className="flex justify-between border-b border-line pb-2">
            <span className="text-muted-foreground">Date</span>
            <span>{formatMonthYear(new Date(order.createdAt))}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Status</span>
            <span>{order.status}</span>
          </div>
        </Card>

        {isPaid ? (
          <Link
            to="/student/course/$courseId"
            params={{ courseId: order.courseSlug }}
            className="mt-8 block"
          >
            <Button block>Start Learning</Button>
          </Link>
        ) : (
          <Link
            to="/courses/$courseId"
            params={{ courseId: order.courseSlug }}
            className="mt-8 block"
          >
            <Button block variant="outline">
              Back to course
            </Button>
          </Link>
        )}
      </div>
    </SiteLayout>
  );
}
