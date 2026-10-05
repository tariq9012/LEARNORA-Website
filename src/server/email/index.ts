import { getServerEnv } from "../env";
import { ConsoleEmailProvider } from "./console-email-provider";
import { GmailEmailProvider } from "./gmail-email-provider";
import { ResendEmailProvider } from "./resend-email-provider";
import type { EmailProvider } from "./email-provider";

export type { EmailProvider, EmailMessage } from "./email-provider";
export { EmailDeliveryError } from "./email-provider";

let cached: EmailProvider | undefined;

export function getEmailProvider(): EmailProvider {
  if (cached) return cached;
  const env = getServerEnv();
  if (env.EMAIL_PROVIDER === "gmail") {
    // env validation guarantees both are present when EMAIL_PROVIDER=gmail.
    cached = new GmailEmailProvider(
      env.GMAIL_USER as string,
      env.GMAIL_PASS as string,
      env.EMAIL_FROM,
    );
  } else if (env.EMAIL_PROVIDER === "resend") {
    // env validation guarantees both are present when EMAIL_PROVIDER=resend.
    cached = new ResendEmailProvider(env.RESEND_API_KEY as string, env.EMAIL_FROM as string);
  } else {
    cached = new ConsoleEmailProvider();
  }
  return cached;
}
