import "server-only";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SmsMessage {
  to: string;
  body: string;
}

export type DeliveryResult =
  | { status: "SENT"; providerId: string | null }
  | { status: "SKIPPED"; reason: string }
  | { status: "FAILED"; error: string };

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const REQUEST_TIMEOUT_MS = 10_000;

/** Sends an email through Resend when configured. Never throws. */
export async function deliverEmail(message: EmailMessage): Promise<DeliveryResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return { status: "SKIPPED", reason: "Email provider not configured (RESEND_API_KEY / EMAIL_FROM)." };
  }
  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [message.to], subject: message.subject, html: message.html, text: message.text }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!response.ok) {
      return { status: "FAILED", error: `Resend ${response.status}: ${body.message ?? "request failed"}` };
    }
    return { status: "SENT", providerId: body.id ?? null };
  } catch (error) {
    return { status: "FAILED", error: error instanceof Error ? error.message : "Unknown email error" };
  }
}

/**
 * Optional SMS integration point. Arkesel (a Ghana-based provider) is wired
 * as the first adapter; other providers can be added behind SMS_PROVIDER.
 */
export async function deliverSms(message: SmsMessage): Promise<DeliveryResult> {
  const provider = process.env.SMS_PROVIDER ?? "none";
  if (provider === "none") return { status: "SKIPPED", reason: "SMS provider not configured." };
  if (provider !== "arkesel") return { status: "SKIPPED", reason: `Unsupported SMS provider "${provider}".` };

  const apiKey = process.env.SMS_API_KEY;
  const sender = process.env.SMS_SENDER_ID;
  if (!apiKey || !sender) return { status: "SKIPPED", reason: "SMS_API_KEY / SMS_SENDER_ID not set." };

  try {
    const response = await fetch("https://sms.arkesel.com/api/v2/sms/send", {
      method: "POST",
      headers: { "api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ sender, message: message.body, recipients: [message.to] }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = (await response.json().catch(() => ({}))) as { status?: string; message?: string };
    if (!response.ok || body.status !== "success") {
      return { status: "FAILED", error: `SMS ${response.status}: ${body.message ?? "request failed"}` };
    }
    return { status: "SENT", providerId: null };
  } catch (error) {
    return { status: "FAILED", error: error instanceof Error ? error.message : "Unknown SMS error" };
  }
}
