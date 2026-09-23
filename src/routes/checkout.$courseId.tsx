import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ShieldCheck, CircleAlert } from "lucide-react";
import { SiteLayout } from "@/components/layout/SiteLayout";
import { Button, Card } from "@/components/ui/kit";
import { categoryImage } from "@/lib/course-images";
import { currency } from "@/data/mock";
import {
  getCheckoutFn,
  createCheckoutOrderFn,
  confirmTestPaymentFn,
} from "@/server/functions/checkout";

export const Route = createFileRoute("/checkout/$courseId")({
  loader: async ({ params }) => {
    const result = await getCheckoutFn({ data: { courseSlug: params.courseId } });
    return { result, courseSlug: params.courseId };
  },
  head: () => ({ meta: [{ title: "Checkout — Learnora" }] }),
  component: CheckoutPage,
});

function CheckoutPage() {
  const { result, courseSlug } = Route.useLoaderData();
  const navigate = useNavigate();

  const [stage, setStage] = useState<"review" | "payment">("review");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!result.success) {
    return (
      <SiteLayout>
        <div className="mx-auto max-w-[520px] px-6 py-24 text-center">
          <CircleAlert size={32} className="mx-auto text-destructive" />
          <p className="mt-4 text-lg">{result.error}</p>
          <Link
            to="/courses/$courseId"
            params={{ courseId: courseSlug }}
            className="mt-6 inline-block"
          >
            <Button variant="outline">Back to course</Button>
          </Link>
        </div>
      </SiteLayout>
    );
  }

  const checkout = result.data;

  async function handleCompletePurchase() {
    setBusy(true);
    setError("");
    try {
      const order = await createCheckoutOrderFn({ data: { courseSlug } });
      if (order.success) {
        setOrderId(order.data.orderId);
        setOrderNumber(order.data.orderNumber);
        setStage("payment");
      } else {
        setError(order.error);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleTestPayment(simulateFailure: boolean) {
    if (!orderId) return;
    setBusy(true);
    setError("");
    try {
      const result = await confirmTestPaymentFn({ data: { orderId, simulateFailure } });
      if (result.success) {
        await navigate({
          to: "/checkout/success/$orderId",
          params: { orderId: result.data.orderId },
        });
      } else {
        setError(result.error);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <SiteLayout>
      <div className="mx-auto max-w-[640px] px-6 py-16">
        <h1 className="font-display text-3xl tracking-tight">Checkout</h1>

        <Card className="mt-6 overflow-hidden">
          <div className="flex gap-4 border-b border-line p-5">
            <img
              src={checkout.thumbnailUrl ?? categoryImage("web-development")}
              alt=""
              className="h-16 w-28 shrink-0 rounded-md object-cover"
            />
            <div>
              <h2 className="font-display text-lg leading-snug">{checkout.courseTitle}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{checkout.instructorName}</p>
            </div>
          </div>

          <div className="space-y-2 p-5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{currency(checkout.originalAmount ?? checkout.amount)}</span>
            </div>
            {checkout.originalAmount != null && (
              <div className="flex justify-between text-good">
                <span>Discount</span>
                <span>−{currency(checkout.originalAmount - checkout.amount)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-line pt-2 text-base font-medium">
              <span>Total</span>
              <span>{currency(checkout.amount)}</span>
            </div>
          </div>

          <div className="border-t border-line p-5">
            {stage === "review" ? (
              <>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ShieldCheck size={14} /> Test payment — no real money will be charged.
                </p>
                <Button block className="mt-3" onClick={handleCompletePurchase} disabled={busy}>
                  {busy ? "Please wait…" : "Complete Purchase"}
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm font-medium">Test payment</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Order {orderNumber} — this is a simulated payment for development/demo purposes.
                  No real card is charged.
                </p>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <Button block onClick={() => handleTestPayment(false)} disabled={busy}>
                    {busy ? "Processing…" : "Complete Test Payment"}
                  </Button>
                  <Button
                    block
                    variant="outline"
                    onClick={() => handleTestPayment(true)}
                    disabled={busy}
                  >
                    Simulate failed payment
                  </Button>
                </div>
              </>
            )}
            {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
          </div>
        </Card>
      </div>
    </SiteLayout>
  );
}
