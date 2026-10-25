import "server-only";
import type { PaymentProvider } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { siteUrl } from "@/lib/utils";
import { generatePaymentReference } from "@/server/orders/reference";
import { activeOnlineProvider } from "./config";
import { mockClient } from "./mock";
import { paystackClient } from "./paystack";
import { PaymentProviderError, type PaymentProviderClient, type Verification } from "./provider";

export function clientFor(provider: PaymentProvider): PaymentProviderClient {
  if (provider === "PAYSTACK") return paystackClient;
  if (provider === "MOCK") return mockClient;
  throw new PaymentProviderError(`No online client for provider ${provider}.`);
}

export class PaymentStartError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentStartError";
  }
}

/**
 * Creates a new payment attempt (unique reference) for an order awaiting
 * payment and returns the provider's checkout URL. Safe to call again to
 * retry after a failed or abandoned attempt.
 */
export async function startPayment(orderId: string): Promise<{ authorizationUrl: string; reference: string }> {
  const provider = activeOnlineProvider();
  if (!provider) throw new PaymentStartError("Online payment is not available right now.");

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.paymentMethod !== "PAYSTACK") throw new PaymentStartError("This order does not use online payment.");
  if (order.paymentStatus === "PAID") throw new PaymentStartError("This order has already been paid.");
  if (order.status !== "PENDING_PAYMENT") throw new PaymentStartError("This order can no longer be paid online.");
  if (order.paymentDueAt && order.paymentDueAt < new Date()) throw new PaymentStartError("The payment window for this order has closed.");
  if (!order.email) throw new PaymentStartError("An email address is required for online payment.");

  const reference = generatePaymentReference(order.reference);
  await prisma.$transaction([
    prisma.payment.create({
      data: { orderId: order.id, provider, reference, amountMinor: order.totalMinor, currency: order.currency, status: "INITIALIZED" },
    }),
    // A retry after a failed attempt puts the order back to "awaiting payment".
    prisma.order.updateMany({ where: { id: order.id, paymentStatus: "FAILED" }, data: { paymentStatus: "PENDING" } }),
  ]);

  try {
    const { authorizationUrl } = await clientFor(provider).initialize({
      reference,
      amountMinor: order.totalMinor,
      currency: "GHS",
      email: order.email,
      callbackUrl: siteUrl(`/checkout/callback?reference=${encodeURIComponent(reference)}`),
      metadata: { orderReference: order.reference, orderId: order.id },
    });
    await prisma.payment.update({ where: { reference }, data: { authorizationUrl } });
    return { authorizationUrl, reference };
  } catch (error) {
    await prisma.payment.update({
      where: { reference },
      data: { status: "FAILED", gatewayResponse: error instanceof Error ? error.message.slice(0, 300) : "initialisation failed" },
    });
    console.error("[payments] initialise failed", { orderId, reference, error });
    throw new PaymentStartError("We couldn't start the payment. Please try again in a moment.");
  }
}

export type ApplyOutcome =
  | "PAID"
  | "ALREADY_PAID"
  | "FAILED"
  | "PENDING"
  | "AMOUNT_MISMATCH"
  | "LATE_PAYMENT"
  | "UNKNOWN_REFERENCE";

export interface ApplyResult {
  outcome: ApplyOutcome;
  orderId: string | null;
  /** True only the first time an order becomes paid — use to send notifications once. */
  newlyPaid: boolean;
  /** True only the first time an order's payment is marked failed. */
  newlyFailed?: boolean;
}

/**
 * Applies a provider-verified result. Idempotent and safe under concurrent
 * webhook + callback delivery: state changes use conditional updates so the
 * order is marked paid exactly once. Never trusts client-supplied data.
 */
export async function applyVerification(reference: string, verification: Verification): Promise<ApplyResult> {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { reference }, include: { order: true } });
    if (!payment) return { outcome: "UNKNOWN_REFERENCE", orderId: null, newlyPaid: false };
    const order = payment.order;

    if (verification.status === "pending") {
      return { outcome: payment.status === "SUCCESS" ? "ALREADY_PAID" : "PENDING", orderId: order.id, newlyPaid: false };
    }

    if (verification.status === "failed" || verification.status === "abandoned") {
      await tx.payment.updateMany({
        where: { id: payment.id, status: "INITIALIZED" },
        data: { status: verification.status === "failed" ? "FAILED" : "ABANDONED", gatewayResponse: verification.gatewayResponse },
      });
      const changed = await tx.order.updateMany({ where: { id: order.id, paymentStatus: "PENDING" }, data: { paymentStatus: "FAILED" } });
      return { outcome: "FAILED", orderId: order.id, newlyPaid: false, newlyFailed: changed.count === 1 };
    }

    // status === "success": the amount and currency must match what we expect.
    if (verification.amountMinor !== payment.amountMinor || verification.amountMinor !== order.totalMinor || verification.currency !== order.currency) {
      await tx.payment.updateMany({
        where: { id: payment.id, status: { not: "SUCCESS" } },
        data: { status: "FAILED", gatewayResponse: `Amount/currency mismatch: got ${verification.amountMinor} ${verification.currency}` },
      });
      await tx.orderNote.create({
        data: {
          orderId: order.id,
          body: `Payment ${reference} reported ${verification.amountMinor} ${verification.currency} but ${order.totalMinor} ${order.currency} was expected. Not marked as paid — investigate in the payment dashboard.`,
        },
      });
      return { outcome: "AMOUNT_MISMATCH", orderId: order.id, newlyPaid: false };
    }

    const paidAt = verification.paidAt ?? new Date();
    const paymentUpdate = await tx.payment.updateMany({
      where: { id: payment.id, status: { not: "SUCCESS" } },
      data: {
        status: "SUCCESS",
        paidAt,
        providerTransactionId: verification.providerTransactionId,
        channel: verification.channel,
        gatewayResponse: verification.gatewayResponse,
      },
    });
    if (paymentUpdate.count === 0) return { outcome: "ALREADY_PAID", orderId: order.id, newlyPaid: false };

    const orderUpdate = await tx.order.updateMany({
      where: { id: order.id, paymentStatus: { not: "PAID" } },
      data: {
        paymentStatus: "PAID",
        paidAt,
        ...(order.status === "PENDING_PAYMENT" ? { status: "CONFIRMED", paymentDueAt: null } : {}),
      },
    });
    if (orderUpdate.count === 0) return { outcome: "ALREADY_PAID", orderId: order.id, newlyPaid: false };

    if (order.status === "PENDING_PAYMENT") {
      await tx.orderStatusHistory.create({
        data: { orderId: order.id, fromStatus: "PENDING_PAYMENT", toStatus: "CONFIRMED", note: `Payment verified (${reference}).` },
      });
      return { outcome: "PAID", orderId: order.id, newlyPaid: true };
    }

    // Paid after the order was cancelled (e.g. payment window expired).
    await tx.orderNote.create({
      data: {
        orderId: order.id,
        body: `Payment ${reference} was verified after the order was ${order.status.toLowerCase()}. Refund the customer or arrange fulfilment manually.`,
      },
    });
    return { outcome: "LATE_PAYMENT", orderId: order.id, newlyPaid: false };
  });
}

/** Verifies a payment with its provider (server-to-server) and applies the result. */
export async function verifyAndApply(reference: string): Promise<ApplyResult> {
  const payment = await prisma.payment.findUnique({ where: { reference }, select: { provider: true, orderId: true } });
  if (!payment) return { outcome: "UNKNOWN_REFERENCE", orderId: null, newlyPaid: false };
  const verification = await clientFor(payment.provider).verify(reference);
  const result = await applyVerification(reference, verification);
  if (result.newlyPaid && result.orderId) {
    const { notifyPaymentConfirmed } = await import("@/server/notifications/order-emails");
    await notifyPaymentConfirmed(result.orderId);
  }
  if (result.newlyFailed && result.orderId) {
    const { notifyPaymentFailed } = await import("@/server/notifications/order-emails");
    await notifyPaymentFailed(result.orderId);
  }
  if (result.outcome === "LATE_PAYMENT" && result.orderId) {
    const { notifyAdminsLatePayment } = await import("@/server/notifications/order-emails");
    await notifyAdminsLatePayment(result.orderId);
  }
  return result;
}
