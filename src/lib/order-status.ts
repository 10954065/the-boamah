/**
 * Order fulfilment state machine. Payment status is tracked separately:
 * a confirmed Cash-on-Delivery order is still UNPAID until cash is recorded.
 */

export const ORDER_STATUSES = [
  "PENDING_PAYMENT",
  "CONFIRMED",
  "PROCESSING",
  "READY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
] as const;

export type OrderStatusCode = (typeof ORDER_STATUSES)[number];
export type FulfilmentMethodCode = "DELIVERY" | "PICKUP";
export type PaymentStatusCode = "PENDING" | "PAID" | "FAILED" | "UNPAID";
export type PaymentMethodCode = "PAYSTACK" | "CASH_ON_DELIVERY";

/** Transitions staff may perform manually. Payment confirmation (PENDING_PAYMENT → CONFIRMED) is system-only. */
const STAFF_TRANSITIONS: Record<OrderStatusCode, readonly OrderStatusCode[]> = {
  PENDING_PAYMENT: ["CANCELLED"],
  CONFIRMED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["READY", "CANCELLED"],
  READY: ["OUT_FOR_DELIVERY", "DELIVERED", "PROCESSING", "CANCELLED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "READY"],
  DELIVERED: [],
  CANCELLED: [],
};

export interface TransitionContext {
  fulfilmentMethod: FulfilmentMethodCode;
  paymentStatus: PaymentStatusCode;
  paymentMethod: PaymentMethodCode;
}

export type TransitionCheck = { ok: true } | { ok: false; message: string };

export function canTransition(from: OrderStatusCode, to: OrderStatusCode, ctx: TransitionContext): TransitionCheck {
  if (from === to) return { ok: false, message: "The order already has this status." };
  if (!STAFF_TRANSITIONS[from].includes(to)) {
    return { ok: false, message: `An order cannot move from ${statusLabel(from, ctx.fulfilmentMethod)} to ${statusLabel(to, ctx.fulfilmentMethod)}.` };
  }
  if (to === "OUT_FOR_DELIVERY" && ctx.fulfilmentMethod === "PICKUP") {
    return { ok: false, message: "Pickup orders are not sent out for delivery." };
  }
  if (to === "CANCELLED" && ctx.paymentStatus === "PAID") {
    return {
      ok: false,
      message: "This order has been paid. Issue the refund with the payment provider before cancelling.",
    };
  }
  if (to === "DELIVERED" && ctx.paymentMethod === "PAYSTACK" && ctx.paymentStatus !== "PAID") {
    return { ok: false, message: "Online payment has not been verified for this order." };
  }
  return { ok: true };
}

export function allowedNextStatuses(from: OrderStatusCode, ctx: TransitionContext): OrderStatusCode[] {
  return STAFF_TRANSITIONS[from].filter((to) => canTransition(from, to, ctx).ok);
}

export function statusLabel(status: OrderStatusCode, method: FulfilmentMethodCode = "DELIVERY"): string {
  switch (status) {
    case "PENDING_PAYMENT":
      return "Awaiting payment";
    case "CONFIRMED":
      return "Confirmed";
    case "PROCESSING":
      return "Being prepared";
    case "READY":
      return method === "PICKUP" ? "Ready for pickup" : "Ready for dispatch";
    case "OUT_FOR_DELIVERY":
      return "Out for delivery";
    case "DELIVERED":
      return method === "PICKUP" ? "Collected" : "Delivered";
    case "CANCELLED":
      return "Cancelled";
  }
}

export function paymentStatusLabel(status: PaymentStatusCode, method: PaymentMethodCode): string {
  switch (status) {
    case "PAID":
      return "Paid";
    case "PENDING":
      return "Awaiting payment";
    case "FAILED":
      return "Payment failed";
    case "UNPAID":
      return method === "CASH_ON_DELIVERY" ? "Pay on delivery" : "Unpaid";
  }
}

/** Ordered steps shown on the customer's tracking timeline. */
export function timelineSteps(method: FulfilmentMethodCode): OrderStatusCode[] {
  return method === "PICKUP"
    ? ["CONFIRMED", "PROCESSING", "READY", "DELIVERED"]
    : ["CONFIRMED", "PROCESSING", "READY", "OUT_FOR_DELIVERY", "DELIVERED"];
}

export function isFinalStatus(status: OrderStatusCode): boolean {
  return status === "DELIVERED" || status === "CANCELLED";
}
