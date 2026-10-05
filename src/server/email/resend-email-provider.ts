import { EmailDeliveryError, type EmailMessage, type EmailProvider } from "./email-provider";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend" as const;

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    /** Injectable for tests; defaults to the platform fetch. */
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly endpoint: string = RESEND_ENDPOINT,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    let response: Response;
    try {
      response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: this.from,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      // Network error / timeout: no status, and never the underlying error text.
      throw new EmailDeliveryError(this.name);
    }
    if (!response.ok) throw new EmailDeliveryError(this.name, response.status);
  }
}
