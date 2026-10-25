import "server-only";
import { prisma } from "@/lib/db";
import { deliverEmail, deliverSms, type DeliveryResult } from "./transport";

export type NotificationType =
  | "PASSWORD_RESET"
  | "ORDER_CONFIRMATION"
  | "PAYMENT_CONFIRMED"
  | "PAYMENT_FAILED"
  | "ORDER_STATUS"
  | "ORDER_CANCELLED"
  | "ADMIN_NEW_ORDER";

interface EmailNotification {
  type: NotificationType;
  to: string;
  subject: string;
  html: string;
  text: string;
  orderId?: string | null;
}

/**
 * Sends an email and records the real outcome (SENT / SKIPPED / FAILED) so
 * failures are visible in Admin → Notifications. Never throws.
 */
export async function sendEmailNotification(notification: EmailNotification): Promise<DeliveryResult> {
  const result = await deliverEmail({
    to: notification.to,
    subject: notification.subject,
    html: notification.html,
    text: notification.text,
  });
  await record({
    channel: "EMAIL",
    type: notification.type,
    recipient: notification.to,
    subject: notification.subject,
    orderId: notification.orderId ?? null,
    result,
  });
  return result;
}

export async function sendSmsNotification(input: {
  type: NotificationType;
  to: string;
  body: string;
  orderId?: string | null;
}): Promise<DeliveryResult> {
  const result = await deliverSms({ to: input.to, body: input.body });
  await record({ channel: "SMS", type: input.type, recipient: input.to, subject: null, orderId: input.orderId ?? null, result });
  return result;
}

async function record(input: {
  channel: "EMAIL" | "SMS";
  type: NotificationType;
  recipient: string;
  subject: string | null;
  orderId: string | null;
  result: DeliveryResult;
}): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        channel: input.channel,
        type: input.type,
        recipient: input.recipient,
        subject: input.subject,
        orderId: input.orderId,
        status: input.result.status,
        providerId: input.result.status === "SENT" ? input.result.providerId : null,
        error:
          input.result.status === "FAILED"
            ? input.result.error.slice(0, 500)
            : input.result.status === "SKIPPED"
              ? input.result.reason
              : null,
      },
    });
  } catch (error) {
    console.error("[notifications] failed to record notification", error);
  }
}
