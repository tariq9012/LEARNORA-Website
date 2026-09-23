/**
 * Payment provider abstraction (Phase 9).
 *
 * Nothing outside src/server/payments/ and payment-service.ts should
 * know or care which concrete provider is active. Today only a
 * SIMULATED/test-mode provider is implemented — see
 * simulated-payment-provider.ts. It moves no real money and never
 * collects real card data. A production deployment can add a real
 * provider (Stripe, etc.) by implementing this same interface and
 * extending the PAYMENT_PROVIDER env enum (see ../env.ts) — the
 * checkout/order/enrollment business logic in payment-service.ts does
 * not need to change.
 */

export type ChargeRequest = {
  /** Authoritative amount, always read from the DB order — never a client-supplied value. */
  amount: number;
  currency: string;
  /** The order's public reference (orderNumber), passed through so provider dashboards/logs can be cross-referenced. */
  reference: string;
  /** Test-mode only: lets the checkout UI's "simulate a failed payment" option exercise the failure path. A real provider ignores this. */
  simulateFailure?: boolean;
};

export type ChargeResult =
  | { status: "SUCCEEDED"; providerReference: string }
  | { status: "FAILED"; providerReference: string; reason: string };

export interface PaymentProvider {
  /** Short machine-readable name, persisted on Payment.provider (e.g. "simulated"). */
  readonly kind: string;

  /**
   * Attempts to charge the given amount. This is a single call, not a
   * multi-step intent/confirm flow — Phase 9's checkout only needs
   * "did the test payment succeed", and a real provider integration can
   * adapt its own intent/webhook flow behind this same method without
   * changing callers.
   */
  charge(request: ChargeRequest): Promise<ChargeResult>;
}
