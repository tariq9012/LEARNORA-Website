import type { EmailMessage } from "./email-provider";

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/**
 * Password-reset email. Contains only the reset link (built from APP_URL),
 * the expiry and a security note — never a password or an internal id.
 */
export function buildPasswordResetEmail(input: {
  to: string;
  resetUrl: string;
  expiresInMinutes: number;
}): EmailMessage {
  const url = escapeHtml(input.resetUrl);
  const expiry =
    input.expiresInMinutes % 60 === 0
      ? `${input.expiresInMinutes / 60} hour${input.expiresInMinutes === 60 ? "" : "s"}`
      : `${input.expiresInMinutes} minutes`;

  const text = [
    "Learnora — reset your password",
    "",
    "We received a request to reset the password for your Learnora account.",
    `Use this link to choose a new password (it expires in ${expiry} and works once):`,
    "",
    input.resetUrl,
    "",
    "If you didn't request this, you can safely ignore this email — your password will not change.",
  ].join("\n");

  const html = `<!doctype html>
<html><body style="margin:0;background:#f4f1ea;font-family:Arial,Helvetica,sans-serif;color:#1c1b19">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
    <table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border-radius:8px;padding:32px" cellpadding="0" cellspacing="0">
      <tr><td style="font-size:22px;font-weight:bold;letter-spacing:.5px">Learnora</td></tr>
      <tr><td style="padding-top:20px;font-size:18px;font-weight:bold">Reset your password</td></tr>
      <tr><td style="padding-top:12px;font-size:15px;line-height:1.5">We received a request to reset the password for your Learnora account. The link below expires in ${escapeHtml(expiry)} and can be used once.</td></tr>
      <tr><td style="padding:24px 0"><a href="${url}" style="background:#1c1b19;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:15px;display:inline-block">Choose a new password</a></td></tr>
      <tr><td style="font-size:13px;line-height:1.5;color:#555">If the button doesn't work, copy this link into your browser:<br><span style="word-break:break-all">${url}</span></td></tr>
      <tr><td style="padding-top:20px;font-size:13px;line-height:1.5;color:#555">If you didn't request this, you can safely ignore this email — your password will not change.</td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  return { to: input.to, subject: "Reset your Learnora password", html, text };
}
