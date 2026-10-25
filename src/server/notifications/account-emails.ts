import "server-only";
import { getStoreSettings } from "@/server/settings";
import { escapeHtml, renderLayout } from "./layout";
import { sendEmailNotification } from "./send";

export async function sendPasswordResetEmail(user: { email: string; name: string }, url: string): Promise<void> {
  const settings = await getStoreSettings();
  const { html, text } = renderLayout({
    settings,
    preheader: "Reset your password",
    heading: "Reset your password",
    bodyHtml: `Hello ${escapeHtml(user.name)},<br><br>We received a request to reset the password for your account. This link expires in 1 hour. If you did not request this, you can safely ignore this email. Your password will not change.`,
    bodyText: `Hello ${user.name},\n\nWe received a request to reset the password for your account. This link expires in 1 hour. If you did not request this, ignore this email.`,
    cta: { label: "Choose a new password", url },
  });

  const result = await sendEmailNotification({
    type: "PASSWORD_RESET",
    to: user.email,
    subject: `Reset your ${settings.storeName} password`,
    html,
    text,
  });

  // Local development without an email provider: surface the link in the
  // server console so the flow can be tested. Never in production.
  if (result.status === "SKIPPED" && process.env.NODE_ENV !== "production") {
    console.info(`[dev] Password reset link for ${user.email}: ${url}`);
  }
}
