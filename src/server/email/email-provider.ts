export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export interface EmailProvider {
  readonly name: "console" | "resend" | "gmail";
  send(message: EmailMessage): Promise<void>;
}

/**
 * Delivery failure with only SAFE detail: provider name and HTTP status.
 * Provider response bodies and keys are never attached.
 */
export class EmailDeliveryError extends Error {
  constructor(
    readonly provider: string,
    readonly status?: number,
    /** Short machine code such as EAUTH / ETIMEDOUT (safe to log; never a message). */
    readonly code?: string,
  ) {
    super(
      `Email delivery failed via ${provider}${status ? ` (HTTP ${status})` : ""}${code ? ` [${code}]` : ""}`,
    );
    this.name = "EmailDeliveryError";
  }
}
