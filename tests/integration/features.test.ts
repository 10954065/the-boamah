import { beforeEach, describe, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { createOrder } from "@/server/orders/checkout";
import { notifyBackInStock } from "@/server/stock-alerts";
import { checkoutInput, createCart, createVariant, resetDatabase, settings } from "./factories";

beforeEach(resetDatabase);

describe("bulk pricing at checkout", () => {
  test("charges the tier price once the quantity reaches it", async () => {
    const { variant } = await createVariant({ price: 2500, stock: 20_000 });
    await prisma.priceTier.create({ data: { variantId: variant.id, minQtyMilli: 5000, unitPriceMinor: 2000 } });
    // The browser's last seen price is irrelevant: the server prices from the database.
    const cart = await createCart([{ variantId: variant.id, quantityMilli: 6000, seen: 2000 }]);

    const order = await createOrder(checkoutInput({ expectedTotalMinor: 6 * 2000 }), { cartId: cart.id, user: null, settings: settings() });

    const saved = await prisma.order.findUniqueOrThrow({ where: { id: order.orderId }, include: { items: true } });
    expect(saved.items[0]).toMatchObject({ unitPriceMinor: 2000, quantityMilli: 6000, lineTotalMinor: 12_000 });
    expect(saved.totalMinor).toBe(12_000);
  });

  test("charges the regular price below the tier", async () => {
    const { variant } = await createVariant({ price: 2500, stock: 20_000 });
    await prisma.priceTier.create({ data: { variantId: variant.id, minQtyMilli: 5000, unitPriceMinor: 2000 } });
    const cart = await createCart([{ variantId: variant.id, quantityMilli: 4000, seen: 2500 }]);

    const order = await createOrder(checkoutInput({ expectedTotalMinor: 4 * 2500 }), { cartId: cart.id, user: null, settings: settings() });

    const saved = await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } });
    expect(saved.totalMinor).toBe(10_000);
  });
});

describe("back in stock alerts", () => {
  test("messages each waiting shopper once, and only when the option is really back", async () => {
    const { variant } = await createVariant({ price: 2500, stock: 0 });
    await prisma.stockAlert.create({ data: { variantId: variant.id, channel: "EMAIL", contact: "waiting@example.com" } });

    expect(await notifyBackInStock([variant.id])).toBe(0);

    await prisma.productVariant.update({ where: { id: variant.id }, data: { stockMilli: 5000 } });
    expect(await notifyBackInStock([variant.id, variant.id])).toBe(1);
    expect(await notifyBackInStock([variant.id])).toBe(0);

    const alert = await prisma.stockAlert.findFirstOrThrow({ where: { variantId: variant.id } });
    expect(alert.notifiedAt).not.toBeNull();
    const sent = await prisma.notification.findMany({ where: { type: "BACK_IN_STOCK" } });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ channel: "EMAIL", recipient: "waiting@example.com" });
  });
});
