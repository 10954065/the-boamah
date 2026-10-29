"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, fromZod, ok, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import type { Totals } from "@/lib/pricing";
import { findCart } from "@/server/cart";
import { getAccessibleOrder, findOrderForTracking, rememberGuestOrder } from "@/server/orders/access";
import { CheckoutError, checkoutSchema, createOrder, quoteCart } from "@/server/orders/checkout";
import { PaymentStartError, startPayment } from "@/server/payments/service";
import { clientIp, rateLimit } from "@/server/rate-limit";
import { getCurrentUser, runAction } from "@/server/session";
import { loadStoreSettings } from "@/server/settings";
import { statusLabel } from "@/lib/order-status";
import { formatDateTime } from "@/lib/utils";

export interface QuoteView {
  totals: Totals;
  freeDeliveryApplied: boolean;
  couponCode: string | null;
  couponMessage: string | null;
  estimatedDelivery: string | null;
}

const quoteInput = z.object({
  fulfilmentMethod: z.enum(["DELIVERY", "PICKUP"]),
  zoneId: z.string().max(64).optional(),
});

/** Server-computed totals for the checkout summary (never computed in the browser). */
export async function quoteCheckout(input: z.input<typeof quoteInput>): Promise<ActionResult<QuoteView>> {
  return runAction("checkout.quote", async () => {
    const parsed = quoteInput.safeParse(input);
    if (!parsed.success) return fail("Invalid checkout details.");
    const [cart, user, settings] = await Promise.all([findCart(), getCurrentUser(), loadStoreSettings()]);
    if (!cart) return fail("Your cart is empty.");
    try {
      const quote = await quoteCart(
        prisma,
        {
          cartId: cart.id,
          fulfilmentMethod: parsed.data.fulfilmentMethod,
          zoneId: parsed.data.zoneId || undefined,
          who: { userId: user?.id ?? null, email: user?.email ?? null },
          settings,
        },
      );
      return ok({
        totals: quote.totals,
        freeDeliveryApplied: quote.freeDeliveryApplied,
        couponCode: quote.couponCode,
        couponMessage: quote.couponMessage,
        estimatedDelivery: quote.zone?.estimatedDelivery ?? null,
      });
    } catch (error) {
      if (error instanceof CheckoutError) return fail(error.message);
      throw error;
    }
  });
}

export async function placeOrder(input: unknown): Promise<ActionResult<{ redirectTo: string; external: boolean }>> {
  return runAction<{ redirectTo: string; external: boolean }>("checkout.placeOrder", async () => {
    if (!(await rateLimit("checkout", await clientIp(), 10, 60))) {
      return fail("Too many attempts. Please wait a minute and try again.");
    }
    const parsed = checkoutSchema.safeParse(input);
    if (!parsed.success) return fromZod(parsed.error);

    const [cart, user, settings] = await Promise.all([findCart(), getCurrentUser(), loadStoreSettings()]);
    if (!cart) return fail("Your cart is empty.");

    let created;
    try {
      created = await createOrder(parsed.data, { cartId: cart.id, user: user ? { id: user.id, email: user.email } : null, settings });
    } catch (error) {
      if (error instanceof CheckoutError) {
        return fail(error.code === "TOTAL_CHANGED" ? `TOTAL_CHANGED:${error.message}` : error.message);
      }
      throw error;
    }

    if (created.guestToken) await rememberGuestOrder(created.reference, created.guestToken);
    revalidatePath("/", "layout");
    const orderPath = user ? `/account/orders/${created.reference}` : `/orders/${created.reference}`;

    if (created.paymentMethod === "CASH_ON_DELIVERY") {
      if (!created.duplicate) {
        const { notifyOrderPlaced } = await import("@/server/notifications/order-emails");
        await notifyOrderPlaced(created.orderId, created.guestToken);
      }
      return ok({ redirectTo: `${orderPath}?placed=1`, external: false });
    }

    try {
      const { authorizationUrl } = await startPayment(created.orderId);
      return ok({ redirectTo: authorizationUrl, external: true });
    } catch (error) {
      if (error instanceof PaymentStartError) {
        return ok({ redirectTo: `${orderPath}?payment=error`, external: false }, error.message);
      }
      throw error;
    }
  });
}

/** Starts a new payment attempt for an order still awaiting payment. */
export async function retryPayment(input: { reference: string; token?: string }): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction("checkout.retryPayment", async () => {
    const parsed = z.object({ reference: z.string().max(40), token: z.string().max(100).optional() }).safeParse(input);
    if (!parsed.success) return fail("Invalid order.");
    if (!(await rateLimit("retry-payment", await clientIp(), 10, 60))) return fail("Too many attempts. Please wait a minute.");
    const order = await getAccessibleOrder(parsed.data.reference, parsed.data.token);
    if (!order) return fail("Order not found.");
    try {
      const { authorizationUrl } = await startPayment(order.id);
      return ok({ redirectTo: authorizationUrl });
    } catch (error) {
      if (error instanceof PaymentStartError) return fail(error.message);
      throw error;
    }
  });
}

export interface TrackingView {
  reference: string;
  status: string;
  statusLabel: string;
  fulfilmentMethod: "DELIVERY" | "PICKUP";
  placedAt: string;
  history: { label: string; at: string }[];
}

export async function trackOrder(input: { reference: string; contact: string }): Promise<ActionResult<TrackingView>> {
  return runAction("orders.track", async () => {
    const parsed = z.object({ reference: z.string().trim().min(8).max(40), contact: z.string().trim().min(5).max(254) }).safeParse(input);
    if (!parsed.success) return fail("Enter your order reference and the email or phone number used for the order.");
    if (!(await rateLimit("track-order", await clientIp(), 10, 300))) return fail("Too many attempts. Please try again in a few minutes.");
    const order = await findOrderForTracking(parsed.data.reference, parsed.data.contact);
    if (!order) return fail("We couldn't find an order matching those details.");
    return ok({
      reference: order.reference,
      status: order.status,
      statusLabel: statusLabel(order.status, order.fulfilmentMethod),
      fulfilmentMethod: order.fulfilmentMethod,
      placedAt: formatDateTime(order.createdAt),
      history: order.statusHistory.map((h) => ({ label: statusLabel(h.toStatus, order.fulfilmentMethod), at: formatDateTime(h.createdAt) })),
    });
  });
}
