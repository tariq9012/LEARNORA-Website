import nodemailer from "nodemailer";

import { EmailDeliveryError, type EmailMessage, type EmailProvider } from "./email-provider";

/** The part of a nodemailer transport we use (lets tests inject a fake). */
export type MailTransport = {
  sendMail(options: {
    from: string;
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<unknown>;
};

export type GmailTransportOverrides = { host?: string; port?: number; secure?: boolean };

/**
 * Sends through Gmail SMTP (smtp.gmail.com:465, TLS) with a Google APP
 * password. Fine for low volume / personal projects: Gmail limits sending
 * (roughly 500 messages a day for a normal account) and always sends as the
 * authenticated Gmail address, whatever EMAIL_FROM says. Use Resend (or
 * another transactional provider with your own domain) for real traffic.
 */
export class GmailEmailProvider implements EmailProvider {
  readonly name = "gmail" as const;
  private readonly transport: MailTransport;
  private readonly from: string;

  constructor(
    user: string,
    appPassword: string,
    from?: string,
    transport?: MailTransport,
    overrides: GmailTransportOverrides = {},
  ) {
    this.from = from ?? `Learnora <${user}>`;
    this.transport =
      transport ??
      nodemailer.createTransport({
        host: overrides.host ?? "smtp.gmail.com",
        port: overrides.port ?? 465,
        secure: overrides.secure ?? true,
        auth: { user, pass: appPassword },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 15_000,
      });
  }

  async send(message: EmailMessage): Promise<void> {
    try {
      await this.transport.sendMail({
        from: this.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
    } catch (error) {
      // Only a short code (EAUTH, ETIMEDOUT, ...) survives — never the SMTP
      // response text, which can echo the username or server internals.
      const raw = (error as { code?: unknown } | null)?.code;
      const code = typeof raw === "string" && /^[A-Z0-9_]{2,30}$/.test(raw) ? raw : undefined;
      throw new EmailDeliveryError(this.name, undefined, code);
    }
  }
}
