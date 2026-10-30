import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { POST as webhook } from "@/app/api/payments/paystack/webhook/route";
import { prisma } from "@/lib/db";
import { createOrder } from "@/server/orders/checkout";
import { cancelOrder } from "@/server/orders/lifecycle";
import { applyVerification } from "@/server/payments/service";
import type { Verification } from "@/server/payments/provider";
import { checkoutInput, createCart, createVariant, resetDatabase, settings } from "./factories";

beforeEach(resetDatabase);
afterEach(() => vi.unstubAllGlobals());

async function onlineOrderWithPayment(total = 3000) {
  const { variant } = await createVariant({ price: total, stock: 5000 });
  const cart = await createCart([{ variantId: variant.id, quantityMilli: 1000, seen: total }]);
  const order = await createOrder(checkoutInput({ paymentMethod: "PAYSTACK", expectedTotalMinor: total }), { cartId: cart.id, settings: settings() });
  const reference = `${order.reference}-TEST`;
  await prisma.payment.create({ data: { orderId: order.orderId, provider: "PAYSTACK", reference, amountMinor: total, status: "INITIALIZED" } });
  return { orderId: order.orderId, reference };
}

const verified = (amountMinor: number, overrides: Partial<Verification> = {}): Verification => ({
  status: "success",
  amountMinor,
  currency: "GHS",
  providerTransactionId: "123",
  channel: "mobile_money",
  gatewayResponse: "Approved",
  paidAt: new Date(),
  ...overrides,
});

describe("applyVerification", () => {
  test("marks the order paid and confirmed exactly once", async () => {
    const { orderId, reference } = await onlineOrderWithPayment();
    const first = await applyVerification(reference, verified(3000));
    const second = await applyVerification(reference, verified(3000));
    expect(first).toMatchObject({ outcome: "PAID", newlyPaid: true });
    expect(second).toMatchObject({ outcome: "ALREADY_PAID", newlyPaid: false });
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { statusHistory: true } });
    expect(order.paymentStatus).toBe("PAID");
    expect(order.status).toBe("CONFIRMED");
    expect(order.statusHistory.filter((h) => h.toStatus === "CONFIRMED")).toHaveLength(1);
  });

  test("refuses to mark paid when the amount or currency does not match", async () => {
    const { orderId, reference } = await onlineOrderWithPayment();
    expect((await applyVerification(reference, verified(2999))).outcome).toBe("AMOUNT_MISMATCH");
    expect((await applyVerification(reference, verified(3000, { currency: "NGN" }))).outcome).toBe("AMOUNT_MISMATCH");
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.paymentStatus).not.toBe("PAID");
    expect(await prisma.orderNote.count({ where: { orderId } })).toBeGreaterThan(0);
  });

  test("a failed payment never marks the order paid and allows a retry", async () => {
    const { orderId, reference } = await onlineOrderWithPayment();
    const result = await applyVerification(reference, verified(3000, { status: "failed" }));
    expect(result).toMatchObject({ outcome: "FAILED", newlyFailed: true });
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.paymentStatus).toBe("FAILED");
    expect(order.status).toBe("PENDING_PAYMENT");
  });

  test("a payment that arrives after cancellation is flagged, not silently applied", async () => {
    const { orderId, reference } = await onlineOrderWithPayment();
    await cancelOrder({ orderId, actorId: null, reason: "Expired" });
    const result = await applyVerification(reference, verified(3000));
    expect(result.outcome).toBe("LATE_PAYMENT");
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe("CANCELLED");
    expect(await prisma.orderNote.count({ where: { orderId } })).toBe(1);
  });
});

describe("Paystack webhook", () => {
  const secret = "sk_test_integration_secret";
  const sign = (body: string) => createHmac("sha512", secret).update(body).digest("hex");
  const request = (body: string, signature: string | null) =>
    new NextRequest("http://localhost/api/payments/paystack/webhook", {
      method: "POST",
      body,
      headers: signature ? { "x-paystack-signature": signature, "content-type": "application/json" } : { "content-type": "application/json" },
    });

  function stubPaystackVerify(reference: string, amount: number, status = "success") {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ status: true, message: "Verification successful", data: { status, amount, currency: "GHS", id: 987, channel: "card", gateway_response: "Successful", paid_at: new Date().toISOString(), reference } }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  test("rejects requests with an invalid signature", async () => {
    const body = JSON.stringify({ event: "charge.success", data: { id: 1, reference: "X" } });
    expect((await webhook(request(body, "bad"))).status).toBe(401);
    expect((await webhook(request(body, null))).status).toBe(401);
    expect(await prisma.paymentEvent.count()).toBe(0);
  });

  test("verifies with Paystack, applies once and ignores duplicate deliveries", async () => {
    const { orderId, reference } = await onlineOrderWithPayment();
    const fetchMock = stubPaystackVerify(reference, 3000);
    const body = JSON.stringify({ event: "charge.success", data: { id: 555, reference, amount: 3000 } });

    const first = await webhook(request(body, sign(body)));
    const duplicate = await webhook(request(body, sign(body)));
    expect(first.status).toBe(200);
    expect(await duplicate.json()).toMatchObject({ duplicate: true });

    // Verification is server-to-server — the webhook payload alone is never trusted.
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(`/transaction/verify/${encodeURIComponent(reference)}`), expect.anything());
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).paymentStatus).toBe("PAID");
    expect(await prisma.paymentEvent.count()).toBe(1);
  });

  test("does not mark paid when Paystack reports a different amount than the payload", async () => {
    const { orderId, reference } = await onlineOrderWithPayment();
    stubPaystackVerify(reference, 100);
    const body = JSON.stringify({ event: "charge.success", data: { id: 777, reference, amount: 3000 } });
    expect((await webhook(request(body, sign(body)))).status).toBe(200);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).paymentStatus).not.toBe("PAID");
  });
});
