import type { EmailMessage, EmailProvider } from "./email-provider";

/**
 * Development-only: prints the message (including any link in it) to the
 * server console. Refuses to run in production — env validation already
 * requires EMAIL_PROVIDER=resend there, this is the second lock.
 */
export class ConsoleEmailProvider implements EmailProvider {
  readonly name = "console" as const;

  async send(message: EmailMessage): Promise<void> {
    if (process.env["NODE_ENV"] === "production") {
      throw new Error("The console email provider cannot be used in production.");
    }
    console.log(
      `[dev-email] To: ${message.to}\n[dev-email] Subject: ${message.subject}\n${message.text}\n`,
    );
  }
}
