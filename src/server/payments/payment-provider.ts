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

export type RefundRequest = {
  /**
   * Authoritative amount as a canonical decimal string (e.g. "79.99"),
   * always read from the DB payment — never client-supplied. A string, not
   * a JS number, so no float rounding can ever creep into a refund.
   */
  amount: string;
  currency: string;
  /** The order's public reference (orderNumber), for cross-referencing in provider dashboards/logs. */
  reference: string;
  /** The provider's id for the ORIGINAL charge (Payment.externalReference) — what a real provider refunds against. */
  paymentExternalReference: string | null;
  /**
   * Stable per-payment key (`refund:<paymentId>`). Sending the same key
   * twice must never move money twice — this is the contract a real
   * provider (Stripe-style idempotency keys) gives us, and what makes a
   * duplicate admin click safe even before our own DB guards are reached.
   */
  idempotencyKey: string;
};

export type RefundResult =
  { status: "SUCCEEDED"; providerReference: string } | { status: "FAILED"; reason: string };

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

  /**
   * Refunds a previously successful charge IN FULL (Phase 10 has no partial
   * refunds). Must be idempotent per `idempotencyKey`. The caller
   * (refund-service.ts) decides eligibility and owns all local database
   * state; the provider only moves (or, when simulated, pretends to move)
   * money.
   */
  refund(request: RefundRequest): Promise<RefundResult>;
}
