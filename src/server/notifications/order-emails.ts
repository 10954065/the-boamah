import "server-only";
import type { Prisma, StoreSettings } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { paymentStatusLabel, statusLabel } from "@/lib/order-status";
import { formatQuantity, type SellingUnitCode } from "@/lib/quantity";
import { siteUrl } from "@/lib/utils";
import { adminNotificationEmails, getStoreSettings } from "@/server/settings";
import { escapeHtml, renderLayout } from "./layout";
import { sendEmailNotification, sendSmsNotification, type NotificationType } from "./send";

const orderInclude = { items: true } satisfies Prisma.OrderInclude;
type OrderWithItems = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

async function loadOrder(orderId: string): Promise<OrderWithItems | null> {
  return prisma.order.findUnique({ where: { id: orderId }, include: orderInclude });
}

/** Link the customer can use to view the order. Guests use tracking (reference + email/phone). */
function orderLink(order: OrderWithItems, guestToken?: string | null): string {
  if (order.userId) return siteUrl(`/account/orders/${order.reference}`);
  if (guestToken) return siteUrl(`/orders/${order.reference}?token=${encodeURIComponent(guestToken)}`);
  return siteUrl(`/track-order?reference=${encodeURIComponent(order.reference)}`);
}

function itemsTable(order: OrderWithItems): { html: string; text: string } {
  const rows = order.items
    .map(
      (item) =>
        `<tr><td style="padding:6px 0;border-bottom:1px solid #eee">${escapeHtml(item.productName)}<br><span style="color:#858c87;font-size:13px">${escapeHtml(item.variantName)} · ${escapeHtml(formatQuantity(item.quantityMilli, item.unit as SellingUnitCode))}</span></td><td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${escapeHtml(formatMoney(item.lineTotalMinor))}</td></tr>`,
    )
    .join("");
  const totals: [string, string][] = [
    ["Subtotal", formatMoney(order.subtotalMinor)],
    ...(order.discountMinor > 0 ? ([["Discount", `−${formatMoney(order.discountMinor)}`]] as [string, string][]) : []),
    [order.fulfilmentMethod === "PICKUP" ? "Pickup" : "Delivery", order.deliveryFeeMinor > 0 ? formatMoney(order.deliveryFeeMinor) : "Free"],
    ["Total", formatMoney(order.totalMinor)],
  ];
  const totalRows = totals
    .map(([label, value]) => `<tr><td style="padding:4px 0">${escapeHtml(label)}</td><td style="padding:4px 0;text-align:right">${escapeHtml(value)}</td></tr>`)
    .join("");
  const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">${rows}${totalRows}</table>`;
  const text = [
    ...order.items.map((item) => `- ${item.productName} (${item.variantName}) × ${formatQuantity(item.quantityMilli, item.unit as SellingUnitCode)}: ${formatMoney(item.lineTotalMinor)}`),
    ...totals.map(([label, value]) => `${label}: ${value}`),
  ].join("\n");
  return { html, text };
}

async function emailCustomer(
  order: OrderWithItems,
  settings: StoreSettings,
  input: { type: NotificationType; subject: string; heading: string; intro: string; includeItems?: boolean; ctaLabel?: string; guestToken?: string | null },
): Promise<void> {
  if (!order.email) return;
  const items = input.includeItems ? itemsTable(order) : null;
  const { html, text } = renderLayout({
    settings,
    preheader: input.subject,
    heading: input.heading,
    bodyHtml: `${escapeHtml(input.intro)}<br><br><strong>Order:</strong> ${escapeHtml(order.reference)}<br><strong>Status:</strong> ${escapeHtml(statusLabel(order.status, order.fulfilmentMethod))}<br><strong>Payment:</strong> ${escapeHtml(paymentStatusLabel(order.paymentStatus, order.paymentMethod))}${items ? `<br><br>${items.html}` : ""}`,
    bodyText: `${input.intro}\n\nOrder: ${order.reference}\nStatus: ${statusLabel(order.status, order.fulfilmentMethod)}\nPayment: ${paymentStatusLabel(order.paymentStatus, order.paymentMethod)}${items ? `\n\n${items.text}` : ""}`,
    cta: { label: input.ctaLabel ?? "View your order", url: orderLink(order, input.guestToken) },
  });
  await sendEmailNotification({ type: input.type, to: order.email, subject: input.subject, html, text, orderId: order.id });
}

async function smsCustomer(order: OrderWithItems, settings: StoreSettings, type: NotificationType, body: string): Promise<void> {
  if (!settings.smsEnabled) return;
  await sendSmsNotification({ type, to: order.phone, body: `${settings.storeName}: ${body}`.slice(0, 300), orderId: order.id });
}

async function emailAdmins(order: OrderWithItems, settings: StoreSettings, subject: string, intro: string, type: NotificationType = "ADMIN_NEW_ORDER"): Promise<void> {
  const recipients = adminNotificationEmails(settings);
  if (recipients.length === 0) return;
  const items = itemsTable(order);
  const { html, text } = renderLayout({
    settings,
    preheader: subject,
    heading: subject,
    bodyHtml: `${escapeHtml(intro)}<br><br><strong>Customer:</strong> ${escapeHtml(order.customerName)} · ${escapeHtml(order.phone)}<br><strong>Fulfilment:</strong> ${escapeHtml(order.fulfilmentMethod === "PICKUP" ? "Pickup" : order.zoneName ? `Delivery to ${order.zoneName}` : "Delivery")}<br><strong>Payment:</strong> ${escapeHtml(paymentStatusLabel(order.paymentStatus, order.paymentMethod))}<br><br>${items.html}`,
    bodyText: `${intro}\n\nCustomer: ${order.customerName} · ${order.phone}\nPayment: ${paymentStatusLabel(order.paymentStatus, order.paymentMethod)}\n\n${items.text}`,
    cta: { label: "Open in admin", url: siteUrl(`/admin/orders/${order.id}`) },
  });
  for (const to of recipients) {
    await sendEmailNotification({ type, to, subject, html, text, orderId: order.id });
  }
}

/** Cash-on-delivery orders are confirmed immediately. */
export async function notifyOrderPlaced(orderId: string, guestToken: string | null): Promise<void> {
  const [order, settings] = await Promise.all([loadOrder(orderId), getStoreSettings()]);
  if (!order) return;
  await emailCustomer(order, settings, {
    type: "ORDER_CONFIRMATION",
    subject: `Order ${order.reference} confirmed`,
    heading: "Thank you, your order is confirmed",
    intro: `Hi ${order.customerName}, we've received your order. You'll pay ${order.fulfilmentMethod === "PICKUP" ? "when you collect it" : "on delivery"}.`,
    includeItems: true,
    guestToken,
  });
  await smsCustomer(order, settings, "ORDER_CONFIRMATION", `Order ${order.reference} confirmed. Total ${formatMoney(order.totalMinor)}.`);
  if (settings.notifyOnNewOrder) await emailAdmins(order, settings, `New order ${order.reference}`, "A new cash-on-delivery order has been placed.");
}

/** Sent only after the payment has been verified with the provider. */
export async function notifyPaymentConfirmed(orderId: string): Promise<void> {
  const [order, settings] = await Promise.all([loadOrder(orderId), getStoreSettings()]);
  if (!order || order.paymentStatus !== "PAID") return;
  await emailCustomer(order, settings, {
    type: "PAYMENT_CONFIRMED",
    subject: `Payment received for order ${order.reference}`,
    heading: "Payment received, your order is confirmed",
    intro: `Hi ${order.customerName}, we've received your payment of ${formatMoney(order.totalMinor)}. We'll let you know as your order progresses.`,
    includeItems: true,
  });
  await smsCustomer(order, settings, "PAYMENT_CONFIRMED", `Payment received for order ${order.reference}. Thank you!`);
  if (settings.notifyOnNewOrder) await emailAdmins(order, settings, `New paid order ${order.reference}`, "Online payment has been verified for this order.");
}

export async function notifyPaymentFailed(orderId: string): Promise<void> {
  const [order, settings] = await Promise.all([loadOrder(orderId), getStoreSettings()]);
  if (!order || order.paymentStatus === "PAID" || order.status !== "PENDING_PAYMENT") return;
  await emailCustomer(order, settings, {
    type: "PAYMENT_FAILED",
    subject: `Payment not completed for order ${order.reference}`,
    heading: "Your payment was not completed",
    intro: `Hi ${order.customerName}, your payment for order ${order.reference} did not go through and you have not been charged by us. You can try again from your order page before the payment window closes.`,
    ctaLabel: "Try payment again",
  });
}

export async function notifyStatusChange(orderId: string): Promise<void> {
  const [order, settings] = await Promise.all([loadOrder(orderId), getStoreSettings()]);
  if (!order) return;
  const label = statusLabel(order.status, order.fulfilmentMethod);
  await emailCustomer(order, settings, {
    type: "ORDER_STATUS",
    subject: `Order ${order.reference}: ${label}`,
    heading: `Your order is ${label.toLowerCase()}`,
    intro: `Hi ${order.customerName}, here's an update on your order.`,
  });
  if (order.status === "OUT_FOR_DELIVERY" || order.status === "READY" || order.status === "DELIVERED") {
    await smsCustomer(order, settings, "ORDER_STATUS", `Order ${order.reference} is ${label.toLowerCase()}.`);
  }
}

export async function notifyOrderCancelled(orderId: string): Promise<void> {
  const [order, settings] = await Promise.all([loadOrder(orderId), getStoreSettings()]);
  if (!order || order.status !== "CANCELLED") return;
  await emailCustomer(order, settings, {
    type: "ORDER_CANCELLED",
    subject: `Order ${order.reference} cancelled`,
    heading: "Your order has been cancelled",
    intro: `Hi ${order.customerName}, order ${order.reference} has been cancelled${order.cancelReason ? `: ${order.cancelReason}` : "."}`,
  });
  await smsCustomer(order, settings, "ORDER_CANCELLED", `Order ${order.reference} has been cancelled.`);
}

export async function notifyAdminsLatePayment(orderId: string): Promise<void> {
  const [order, settings] = await Promise.all([loadOrder(orderId), getStoreSettings()]);
  if (!order) return;
  await emailAdmins(
    order,
    settings,
    `Action needed: late payment on ${order.reference}`,
    "A payment was verified after this order was cancelled. Refund the customer or arrange fulfilment.",
    "ADMIN_NEW_ORDER",
  );
}
