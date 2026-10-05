import { createHash, randomUUID } from "node:crypto";

import type {
  ChargeRequest,
  ChargeResult,
  PaymentProvider,
  RefundRequest,
  RefundResult,
} from "./payment-provider";

/**
 * Test-mode provider for local development and demos. It never talks to
 * a real payment network, never collects a card number/CVV/bank
 * credential of any kind, and never moves real money — the UI that
 * calls this must say so explicitly ("Test payment — no real money will
 * be charged").
 *
 * Success/failure is decided entirely by the `simulateFailure` flag the
 * caller passes through (surfaced in the checkout UI as a "simulate a
 * failed payment" option) — there is no other logic here, deliberately,
 * since this provider exists only to exercise the real order/payment/
 * enrollment state machine end to end.
 */
export class SimulatedPaymentProvider implements PaymentProvider {
  readonly kind = "simulated";

  async charge(request: ChargeRequest): Promise<ChargeResult> {
    const providerReference = `SIM-${randomUUID()}`;

    if (request.simulateFailure) {
      return {
        status: "FAILED",
        providerReference,
        reason: "Simulated payment failure (test mode).",
      };
    }

    return { status: "SUCCEEDED", providerReference };
  }

  /**
   * Always succeeds — no real money moves. The provider reference is derived
   * deterministically from the idempotency key, so a repeated call for the
   * same payment returns the SAME reference (exactly what a real provider's
   * idempotency-key handling would do).
   */
  async refund(request: RefundRequest): Promise<RefundResult> {
    const digest = createHash("sha256").update(request.idempotencyKey).digest("hex");
    return {
      status: "SUCCEEDED",
      providerReference: `SIM-RFD-${digest.slice(0, 20).toUpperCase()}`,
    };
  }
}
