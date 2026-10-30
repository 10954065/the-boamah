import { beforeEach, describe, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { CheckoutError, createOrder } from "@/server/orders/checkout";
import { cancelOrder, expireUnpaidOrders, OrderActionError, recordCashPayment } from "@/server/orders/lifecycle";
import { checkoutInput, createCart, createVariant, createZone, resetDatabase, settings } from "./factories";

beforeEach(resetDatabase);

describe("createOrder", () => {
  test("prices from the database, reserves stock and clears the cart", async () => {
    const { variant } = await createVariant({ price: 2500, sale: 2000, stock: 10_000 });
    // The customer saw an old price; the server must still charge the current sale price.
    const cart = await createCart([{ variantId: variant.id, quantityMilli: 3000, seen: 9999 }]);
    const zone = await createZone(1500);

    const order = await createOrder(
      checkoutInput({ fulfilmentMethod: "DELIVERY", zoneId: zone.id, city: "Accra", area: "Osu", addressLine: "1 Test St", expectedTotalMinor: 3 * 2000 + 1500 }),
      { cartId: cart.id, settings: settings() },
    );

    const saved = await prisma.order.findUniqueOrThrow({ where: { id: order.orderId }, include: { items: true, statusHistory: true } });
    expect(saved.subtotalMinor).toBe(6000);
    expect(saved.deliveryFeeMinor).toBe(1500);
    expect(saved.totalMinor).toBe(7500);
    expect(saved.status).toBe("CONFIRMED");
    expect(saved.paymentStatus).toBe("UNPAID");
    expect(saved.items[0]).toMatchObject({ unitPriceMinor: 2000, quantityMilli: 3000, lineTotalMinor: 6000 });
    expect(saved.statusHistory).toHaveLength(1);
    expect(order.guestToken).toBeTruthy();

    const after = await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(after.stockMilli).toBe(7000);
    expect(await prisma.inventoryMovement.count({ where: { orderId: order.orderId, type: "ORDER_RESERVED" } })).toBe(1);
    expect(await prisma.cartItem.count({ where: { cartId: cart.id } })).toBe(0);
  });

  test("rejects a stale total without creating an order or touching stock", async () => {
    const { variant } = await createVariant({ price: 1000, stock: 5000 });
    const cart = await createCart([{ variantId: variant.id, quantityMilli: 1000, seen: 1000 }]);
    await expect(createOrder(checkoutInput({ expectedTotalMinor: 999 }), { cartId: cart.id, settings: settings() })).rejects.toMatchObject({
      code: "TOTAL_CHANGED",
    });
    expect(await prisma.order.count()).toBe(0);
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } })).stockMilli).toBe(5000);
  });

  test("is idempotent per checkout attempt", async () => {
    const { variant } = await createVariant({ price: 1000, stock: 5000 });
    const cart = await createCart([{ variantId: variant.id, quantityMilli: 1000, seen: 1000 }]);
    const input = checkoutInput({ expectedTotalMinor: 1000 });
    const first = await createOrder(input, { cartId: cart.id, settings: settings() });
    const second = await createOrder(input, { cartId: cart.id, settings: settings() });
    expect(second.duplicate).toBe(true);
    expect(second.orderId).toBe(first.orderId);
    expect(await prisma.order.count()).toBe(1);
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } })).stockMilli).toBe(4000);
  });

  test("never oversells when two customers buy the last item at the same time", async () => {
    const { variant } = await createVariant({ price: 1000, stock: 1000 });
    const carts = await Promise.all([1, 2].map(() => createCart([{ variantId: variant.id, quantityMilli: 1000, seen: 1000 }])));
    const results = await Promise.allSettled(
      carts.map((cart) => createOrder(checkoutInput({ expectedTotalMinor: 1000 }), { cartId: cart.id, settings: settings() })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failure = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(failure.reason).toBeInstanceOf(CheckoutError);
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } })).stockMilli).toBe(0);
    expect(await prisma.order.count()).toBe(1);
  });

  test("blocks delivery below the zone minimum and disabled payment methods", async () => {
    const { variant } = await createVariant({ price: 1000, stock: 5000 });
    const cart = await createCart([{ variantId: variant.id, quantityMilli: 1000, seen: 1000 }]);
    const zone = await createZone(1000, 5000);
    await expect(
      createOrder(checkoutInput({ fulfilmentMethod: "DELIVERY", zoneId: zone.id, city: "Accra", area: "Osu", addressLine: "1 Test St", expectedTotalMinor: 2000 }), {
        cartId: cart.id,
        settings: settings(),
      }),
    ).rejects.toMatchObject({ code: "ZONE" });
    await expect(createOrder(checkoutInput({ expectedTotalMinor: 1000 }), { cartId: cart.id, settings: settings({ codEnabled: false }) })).rejects.toMatchObject({
      code: "PAYMENT_METHOD",
    });
  });

  test("enforces coupon usage limits across orders", async () => {
    const { variant } = await createVariant({ price: 10_000, stock: 10_000 });
    await prisma.coupon.create({ data: { code: "ONCE", type: "FIXED", value: 1000, usageLimit: 1 } });
    const first = await createCart([{ variantId: variant.id, quantityMilli: 1000, seen: 10_000 }], "ONCE");
    const second = await createCart([{ variantId: variant.id, quantityMilli: 1000, seen: 10_000 }], "ONCE");

    const order = await createOrder(checkoutInput({ email: "a@example.com", expectedTotalMinor: 9000 }), { cartId: first.id, settings: settings() });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } })).discountMinor).toBe(1000);
    expect((await prisma.coupon.findUniqueOrThrow({ where: { code: "ONCE" } })).usedCount).toBe(1);

    // The coupon is exhausted, so the discounted total the customer expected is no longer valid.
    await expect(createOrder(checkoutInput({ email: "b@example.com", expectedTotalMinor: 9000 }), { cartId: second.id, settings: settings() })).rejects.toMatchObject({
      code: "TOTAL_CHANGED",
    });
  });
});

describe("order lifecycle", () => {
  async function placeOrder(paymentMethod: "CASH_ON_DELIVERY" | "PAYSTACK" = "CASH_ON_DELIVERY") {
    const { variant } = await createVariant({ price: 1500, stock: 4000 });
    const cart = await createCart([{ variantId: variant.id, quantityMilli: 2000, seen: 1500 }]);
    const order = await createOrder(checkoutInput({ paymentMethod, expectedTotalMinor: 3000 }), { cartId: cart.id, settings: settings() });
    return { order, variant };
  }

  test("cancellation restores stock exactly once", async () => {
    const { order, variant } = await placeOrder();
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } })).stockMilli).toBe(2000);
    await cancelOrder({ orderId: order.orderId, actorId: null, reason: "Customer request" });
    await expect(cancelOrder({ orderId: order.orderId, actorId: null, reason: "again" })).rejects.toBeInstanceOf(OrderActionError);
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } })).stockMilli).toBe(4000);
    expect(await prisma.inventoryMovement.count({ where: { orderId: order.orderId, type: "ORDER_RELEASED" } })).toBe(1);
  });

  test("cash can only be recorded once and for the exact total", async () => {
    const { order } = await placeOrder();
    const staff = await prisma.user.create({ data: { id: "staff-1", name: "Staff", email: "staff@example.com", role: "ORDER_MANAGER" } });
    await expect(recordCashPayment({ orderId: order.orderId, actorId: staff.id, amountMinor: 2999 })).rejects.toBeInstanceOf(OrderActionError);
    await recordCashPayment({ orderId: order.orderId, actorId: staff.id, amountMinor: 3000 });
    await expect(recordCashPayment({ orderId: order.orderId, actorId: staff.id, amountMinor: 3000 })).rejects.toBeInstanceOf(OrderActionError);
    const saved = await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } });
    expect(saved.paymentStatus).toBe("PAID");
    expect(await prisma.payment.count({ where: { orderId: order.orderId, provider: "CASH" } })).toBe(1);
  });

  test("paid orders cannot be cancelled without a refund", async () => {
    const { order } = await placeOrder();
    await prisma.order.update({ where: { id: order.orderId }, data: { paymentStatus: "PAID" } });
    await expect(cancelOrder({ orderId: order.orderId, actorId: null, reason: "x" })).rejects.toBeInstanceOf(OrderActionError);
  });

  test("unpaid online orders past their window are cancelled and stock released", async () => {
    const { order, variant } = await placeOrder("PAYSTACK");
    await prisma.order.update({ where: { id: order.orderId }, data: { paymentDueAt: new Date(Date.now() - 60_000) } });
    const result = await expireUnpaidOrders();
    expect(result.expired).toBe(1);
    const saved = await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } });
    expect(saved.status).toBe("CANCELLED");
    expect(saved.paymentStatus).toBe("FAILED");
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } })).stockMilli).toBe(4000);
  });
});
