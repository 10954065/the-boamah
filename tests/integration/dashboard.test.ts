import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, test } from "vitest";
import type { OrderStatus, PaymentMethod, PaymentStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { getDashboardMetrics } from "@/server/admin-metrics";
import { createOrder } from "@/server/orders/checkout";
import { tillSalesByDay, tillTakingsSince } from "@/server/pos/reports";
import { recordPosSale } from "@/server/pos/sales";
import { openPosShift } from "@/server/pos/shifts";
import { checkoutInput, createCart, createStaff, createTill, createVariant, resetDatabase, settings } from "./factories";

beforeEach(resetDatabase);

const NOW = new Date("2026-11-20T12:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);

/** A GH₵20 order placed at a given time, then set to the state a test needs. */
async function orderAt(at: Date, state: { status?: OrderStatus; paymentStatus?: PaymentStatus; paymentMethod?: PaymentMethod } = {}): Promise<string> {
  const { variant } = await createVariant({ price: 1000, stock: 9000 });
  const cart = await createCart([{ variantId: variant.id, quantityMilli: 2000, seen: 1000 }]);
  const { orderId } = await createOrder(checkoutInput({ expectedTotalMinor: 2000 }), { cartId: cart.id, settings: settings() });
  await prisma.order.update({ where: { id: orderId }, data: { createdAt: at, ...state } });
  return orderId;
}

describe("dashboard figures", () => {
  test("compare the period with the same length of time just before it", async () => {
    await orderAt(daysAgo(2), { paymentStatus: "PAID", paymentMethod: "PAYSTACK" });
    await orderAt(daysAgo(3), { paymentStatus: "PAID" });
    await orderAt(daysAgo(4));
    await orderAt(daysAgo(10), { paymentStatus: "PAID" });
    await orderAt(daysAgo(20), { paymentStatus: "PAID" });

    const m = await getDashboardMetrics(7, NOW);

    expect(m).toMatchObject({ totalOrders: 3, paidOrders: 2, paidRevenueMinor: 4000 });
    expect(m.previous).toEqual({ totalOrders: 1, paidOrders: 1, paidRevenueMinor: 2000 });
  });

  test("split paid sales into paid online and cash on delivery collected", async () => {
    await orderAt(daysAgo(1), { paymentStatus: "PAID", paymentMethod: "PAYSTACK" });
    await orderAt(daysAgo(1), { paymentStatus: "PAID", paymentMethod: "PAYSTACK" });
    await orderAt(daysAgo(1), { paymentStatus: "PAID" });
    await orderAt(daysAgo(1));

    expect((await getDashboardMetrics(7, NOW)).paidByMethod).toEqual({ onlineMinor: 4000, cashOnDeliveryMinor: 2000 });
  });

  test("count every open order by where it is, however long ago it was placed", async () => {
    await orderAt(daysAgo(1));
    await orderAt(daysAgo(200));
    await orderAt(daysAgo(2), { status: "PROCESSING" });
    await orderAt(daysAgo(3), { status: "READY" });
    await orderAt(daysAgo(3), { status: "OUT_FOR_DELIVERY" });
    await orderAt(daysAgo(1), { status: "PENDING_PAYMENT", paymentStatus: "PENDING", paymentMethod: "PAYSTACK" });
    await orderAt(daysAgo(1), { status: "DELIVERED" });
    await orderAt(daysAgo(1), { status: "CANCELLED" });

    expect((await getDashboardMetrics(7, NOW)).pipeline).toEqual({ PENDING_PAYMENT: 1, CONFIRMED: 2, PROCESSING: 1, READY: 1, OUT_FOR_DELIVERY: 1 });
  });

  test("give every day of the period, with nothing on days without orders", async () => {
    await orderAt(daysAgo(1), { paymentStatus: "PAID" });

    const { daily } = await getDashboardMetrics(7, NOW);

    expect(daily).toHaveLength(7);
    expect(daily.at(-1)?.day).toBe("2026-11-20");
    expect(daily.find((day) => day.day === "2026-11-19")).toEqual({ day: "2026-11-19", paidMinor: 2000, orders: 1 });
    expect(daily.filter((day) => day.orders === 0)).toHaveLength(6);
  });
});

describe("till figures for the dashboard", () => {
  async function sellOn(sales: readonly { soldAt: string; priceMinor: number }[]) {
    await createTill();
    const cashier = await createStaff();
    const { variant } = await createVariant({ price: 1000, stock: 100_000 });
    const opened = await openPosShift({ clientId: randomUUID(), tillCode: "T1", openedAt: "2026-11-18T07:00:00Z", openingFloatMinor: 0 }, cashier, NOW);
    if (opened.status === "rejected") throw new Error(opened.error);
    for (const [index, sale] of sales.entries()) {
      const sold = await recordPosSale(
        {
          clientId: randomUUID(),
          receiptNumber: `T1-${String(index + 1).padStart(6, "0")}`,
          tillCode: "T1",
          shiftClientId: opened.shift.clientId,
          cashierId: cashier.id,
          soldAt: sale.soldAt,
          items: [{ variantId: variant.id, quantityMilli: 1000, unitPriceMinor: sale.priceMinor }],
          payments: [{ method: "CASH", amountMinor: sale.priceMinor }],
        },
        NOW,
      );
      if (sold.status === "rejected") throw new Error(sold.error);
    }
  }

  test("sales are added up per day", async () => {
    await sellOn([
      { soldAt: "2026-11-18T09:00:00Z", priceMinor: 1000 },
      { soldAt: "2026-11-18T15:00:00Z", priceMinor: 1000 },
      { soldAt: "2026-11-19T10:00:00Z", priceMinor: 1000 },
    ]);

    const byDay = await tillSalesByDay(new Date("2026-11-18T00:00:00Z"));

    expect(Object.fromEntries(byDay)).toEqual({ "2026-11-18": 2000, "2026-11-19": 1000 });
  });

  test("takings can be read for the period before, without the period after", async () => {
    await sellOn([
      { soldAt: "2026-11-18T09:00:00Z", priceMinor: 1000 },
      { soldAt: "2026-11-19T10:00:00Z", priceMinor: 1000 },
      { soldAt: "2026-11-19T11:00:00Z", priceMinor: 1000 },
    ]);
    const split = new Date("2026-11-19T00:00:00Z");

    expect(await tillTakingsSince(new Date("2026-11-18T00:00:00Z"), split)).toEqual({ salesCount: 1, salesTotalMinor: 1000, refundedMinor: 0 });
    expect(await tillTakingsSince(split)).toEqual({ salesCount: 2, salesTotalMinor: 2000, refundedMinor: 0 });
  });
});
