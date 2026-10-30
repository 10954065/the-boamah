import { beforeEach, describe, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { createOrder } from "@/server/orders/checkout";
import { OrderActionError, updateOrderStatus } from "@/server/orders/lifecycle";
import { moveTillOrder, tillOrders } from "@/server/pos/orders";
import { checkoutInput, createCart, createStaff, createVariant, createZone, resetDatabase, settings } from "./factories";

beforeEach(resetDatabase);

async function placeOrder(overrides: Record<string, unknown> = {}, deliveryFeeMinor = 0): Promise<string> {
  const { variant } = await createVariant({ price: 1000, stock: 9000 });
  const cart = await createCart([{ variantId: variant.id, quantityMilli: 2000, seen: 1000 }]);
  const created = await createOrder(checkoutInput({ expectedTotalMinor: 2000 + deliveryFeeMinor, ...overrides }), { cartId: cart.id, settings: settings() });
  return created.orderId;
}

async function placeDelivery(): Promise<string> {
  const zone = await createZone(1500);
  return placeOrder({ fulfilmentMethod: "DELIVERY", zoneId: zone.id, city: "Accra", area: "Osu", addressLine: "1 Test Street", deliveryInstructions: "Blue gate" }, 1500);
}

const setStatus = (id: string, status: "PENDING_PAYMENT" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELLED") => prisma.order.update({ where: { id }, data: { status } });

describe("the till's list of website orders", () => {
  test("a placed order reaches the till with what the packer needs", async () => {
    const orderId = await placeDelivery();

    const [order] = await tillOrders();

    expect(order).toMatchObject({
      id: orderId,
      customerName: "Test Customer",
      phone: "0241234567",
      fulfilmentMethod: "DELIVERY",
      status: "CONFIRMED",
      city: "Accra",
      area: "Osu",
      addressLine: "1 Test Street",
      deliveryInstructions: "Blue gate",
      paymentMethod: "CASH_ON_DELIVERY",
      paymentStatus: "UNPAID",
      totalMinor: 3500,
    });
    expect(order?.reference).toMatch(/^BMH-/);
    expect(order?.lines).toHaveLength(1);
    expect(order?.lines[0]).toMatchObject({ quantityMilli: 2000, unit: expect.any(String), productName: expect.any(String), variantName: expect.any(String), sku: expect.any(String) });
  });

  test("gives the packer nothing they do not need", async () => {
    await placeOrder();
    const [order] = await tillOrders();
    expect(order).not.toHaveProperty("email");
    expect(order).not.toHaveProperty("guestTokenHash");
    expect(order).not.toHaveProperty("idempotencyKey");
  });

  test("leaves out orders that are not paid for yet, cancelled or finished, and keeps those on the road", async () => {
    const waiting = await placeOrder();
    const cancelled = await placeOrder();
    const delivered = await placeOrder();
    const onTheRoad = await placeOrder();
    const toPack = await placeOrder();
    await setStatus(waiting, "PENDING_PAYMENT");
    await setStatus(cancelled, "CANCELLED");
    await setStatus(delivered, "DELIVERED");
    await setStatus(onTheRoad, "OUT_FOR_DELIVERY");

    expect(new Set((await tillOrders()).map((order) => order.id))).toEqual(new Set([onTheRoad, toPack]));
  });

  test("puts the longest waiting order first", async () => {
    const second = await placeOrder();
    const first = await placeOrder();
    await prisma.order.update({ where: { id: first }, data: { createdAt: new Date("2026-10-01T08:00:00Z") } });

    expect((await tillOrders()).map((order) => order.id)).toEqual([first, second]);
  });
});

describe("packing from the till", () => {
  test("a pickup order goes from packing to collected, recording who did each step", async () => {
    const orderId = await placeOrder();
    const cashier = await createStaff();

    await moveTillOrder({ orderId, to: "PROCESSING" }, cashier);
    await moveTillOrder({ orderId, to: "READY" }, cashier);
    await moveTillOrder({ orderId, to: "DELIVERED" }, cashier);

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { statusHistory: { orderBy: { createdAt: "asc" } } } });
    expect(order.status).toBe("DELIVERED");
    expect(order.deliveredAt).not.toBeNull();
    expect(order.statusHistory.slice(1).map((step) => [step.toStatus, step.actorId])).toEqual([
      ["PROCESSING", cashier.id],
      ["READY", cashier.id],
      ["DELIVERED", cashier.id],
    ]);
    expect(await prisma.auditLog.count({ where: { actorId: cashier.id, action: "order.status", entityId: orderId } })).toBe(3);
    expect(await tillOrders()).toEqual([]);
  });

  test("a delivery order stays on the till with the rider and leaves once delivered", async () => {
    const orderId = await placeDelivery();
    const cashier = await createStaff();

    await moveTillOrder({ orderId, to: "PROCESSING" }, cashier);
    await moveTillOrder({ orderId, to: "READY" }, cashier);
    await moveTillOrder({ orderId, to: "OUT_FOR_DELIVERY" }, cashier);
    expect((await tillOrders())[0]?.status).toBe("OUT_FOR_DELIVERY");
    await moveTillOrder({ orderId, to: "DELIVERED" }, cashier);

    expect(await tillOrders()).toEqual([]);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).deliveredAt).not.toBeNull();
  });

  test.each(["READY", "DELIVERED", "OUT_FOR_DELIVERY", "CANCELLED"] as const)("cannot jump from a new order to %s", async (to) => {
    const orderId = await placeOrder();
    const cashier = await createStaff();

    await expect(moveTillOrder({ orderId, to }, cashier)).rejects.toThrow(OrderActionError);

    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("CONFIRMED");
  });

  test("a pickup order is never sent out for delivery", async () => {
    const orderId = await placeOrder();
    const cashier = await createStaff();
    await moveTillOrder({ orderId, to: "PROCESSING" }, cashier);
    await moveTillOrder({ orderId, to: "READY" }, cashier);

    await expect(moveTillOrder({ orderId, to: "OUT_FOR_DELIVERY" }, cashier)).rejects.toThrow(OrderActionError);
  });

  test("a second person pressing the same step is told the order has moved on", async () => {
    const orderId = await placeOrder();
    const cashier = await createStaff();
    await moveTillOrder({ orderId, to: "PROCESSING" }, cashier);

    await expect(moveTillOrder({ orderId, to: "PROCESSING" }, cashier)).rejects.toThrow(/moved on/);
  });

  test("a step saved against a status the order has left changes nothing", async () => {
    const orderId = await placeOrder();
    const cashier = await createStaff();
    await moveTillOrder({ orderId, to: "PROCESSING" }, cashier);
    await moveTillOrder({ orderId, to: "READY" }, cashier);

    // Ready may go back to packing in the admin, but not from a till that last saw the order being packed.
    await expect(updateOrderStatus({ orderId, to: "PROCESSING", actorId: cashier.id, from: "CONFIRMED" })).rejects.toThrow(/moved on/);

    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("READY");
  });

  test("an order that does not exist is refused", async () => {
    const cashier = await createStaff();
    await expect(moveTillOrder({ orderId: "missing", to: "PROCESSING" }, cashier)).rejects.toThrow(OrderActionError);
  });
});
