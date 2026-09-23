import { getServerEnv } from "../env";
import { SimulatedPaymentProvider } from "./simulated-payment-provider";
import type { PaymentProvider } from "./payment-provider";

export type { PaymentProvider, ChargeRequest, ChargeResult } from "./payment-provider";

let cached: PaymentProvider | undefined;

/**
 * Returns the configured payment provider. This is the only place that
 * decides which concrete provider backs the app — everything else
 * depends on the PaymentProvider interface only.
 */
export function getPaymentProvider(): PaymentProvider {
  if (cached) return cached;
  const env = getServerEnv();

  switch (env.PAYMENT_PROVIDER) {
    case "simulated":
      cached = new SimulatedPaymentProvider();
      return cached;
    default: {
      const unreachable: never = env.PAYMENT_PROVIDER;
      throw new Error(`Unsupported PAYMENT_PROVIDER: ${String(unreachable)}`);
    }
  }
}
