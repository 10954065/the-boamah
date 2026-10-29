import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import type { PosShiftClose, PosShiftOpen } from "@/lib/pos";
import { loadPosCatalog } from "@/server/pos/catalog";
import { recordPosSale } from "@/server/pos/sales";
import { closePosShift, openPosShift, openShiftForTill } from "@/server/pos/shifts";
import { createStaff, createTill, createVariant, resetDatabase } from "./factories";

beforeEach(resetDatabase);

const NOW = new Date("2026-11-02T18:00:00Z");

const opening = (overrides: Partial<PosShiftOpen> = {}): PosShiftOpen => ({
  clientId: randomUUID(),
  tillCode: "T1",
  openedAt: "2026-11-02T08:00:00Z",
  openingFloatMinor: 20_000,
  ...overrides,
});

const closing = (clientId: string, overrides: Partial<PosShiftClose> = {}): PosShiftClose => ({
  clientId,
  closedAt: "2026-11-02T17:55:00Z",
  countedCashMinor: 0,
  countedMomoMinor: 0,
  countedCardMinor: 0,
  ...overrides,
});

describe("opening a shift", () => {
  test("opens with the float, and sending it again changes nothing", async () => {
    await createTill();
    const cashier = await createStaff();
    const input = opening();

    const first = await openPosShift(input, cashier, NOW);
    const again = await openPosShift(input, cashier, NOW);

    expect(first).toMatchObject({ status: "opened", shift: { clientId: input.clientId, tillCode: "T1", cashierId: cashier.id, openingFloatMinor: 20_000, closedAt: null } });
    expect(again.status).toBe("duplicate");
    expect(await prisma.posShift.count()).toBe(1);
    expect(await openShiftForTill("T1")).toMatchObject({ clientId: input.clientId, cashierName: cashier.name });
  });

  test("only one shift runs on a till; the second is told whose is open", async () => {
    await createTill();
    const first = await createStaff();
    const second = await createStaff();
    await openPosShift(opening(), first, NOW);

    const result = await openPosShift(opening(), second, NOW);

    expect(result).toMatchObject({ status: "rejected", openShift: { cashierId: first.id } });
    expect(result.status === "rejected" && result.error).toContain(first.name);
    expect(await prisma.posShift.count()).toBe(1);
  });

  test("refuses a till that is off, a clock far ahead, and accounts that cannot sell", async () => {
    await createTill("T2", false);
    const cashier = await createStaff();
    const customer = await createStaff("CUSTOMER");

    expect(await openPosShift(opening({ tillCode: "T2" }), cashier, NOW)).toMatchObject({ status: "rejected", error: expect.stringMatching(/switched off/) });
    await createTill();
    expect(await openPosShift(opening({ openedAt: "2026-11-02T19:00:00Z" }), cashier, NOW)).toMatchObject({ status: "rejected", error: expect.stringMatching(/clock is ahead/) });
    expect(await openPosShift(opening(), customer, NOW)).toMatchObject({ status: "rejected" });
    expect(await prisma.posShift.count()).toBe(0);
  });
});

describe("closing a shift", () => {
  async function shiftWithSales() {
    await createTill();
    const cashier = await createStaff();
    const { variant } = await createVariant({ price: 2500, stock: 100_000 });
    const opened = await openPosShift(opening(), cashier, NOW);
    if (opened.status === "rejected") throw new Error(opened.error);
    const sell = (receipt: string, quantityMilli: number, payments: { method: "CASH" | "MOMO" | "CARD"; amountMinor: number; reference?: string }[]) =>
      recordPosSale(
        {
          clientId: randomUUID(),
          receiptNumber: receipt,
          tillCode: "T1",
          shiftClientId: opened.shift.clientId,
          cashierId: cashier.id,
          soldAt: "2026-11-02T12:00:00Z",
          items: [{ variantId: variant.id, quantityMilli, unitPriceMinor: 2500 }],
          payments,
        },
        NOW,
      );
    await sell("T1-000001", 3000, [{ method: "CASH", amountMinor: 10_000 }]); // 75.00, change 25.00
    await sell("T1-000002", 2000, [{ method: "MOMO", amountMinor: 5000, reference: "MP1" }]);
    await sell("T1-000003", 1000, [{ method: "CARD", amountMinor: 2500 }]);
    return { cashier, shift: opened.shift };
  }

  test("records the counts and reports expected against counted from the shift's sales", async () => {
    const { cashier, shift } = await shiftWithSales();

    const result = await closePosShift(closing(shift.clientId, { countedCashMinor: 27_000, countedMomoMinor: 5000, countedCardMinor: 2500, notes: " One GH₵5 note torn " }), cashier, NOW);

    expect(result).toMatchObject({
      status: "closed",
      shift: { closedAt: "2026-11-02T17:55:00.000Z", countedMinor: { CASH: 27_000, MOMO: 5000, CARD: 2500 }, notes: "One GH₵5 note torn" },
      summary: { salesCount: 3, salesTotalMinor: 15_000, expectedMinor: { CASH: 27_500, MOMO: 5000, CARD: 2500 } },
    });
    expect(await openShiftForTill("T1")).toBeNull();
  });

  test("closing again returns the first close unchanged", async () => {
    const { cashier, shift } = await shiftWithSales();
    await closePosShift(closing(shift.clientId, { countedCashMinor: 27_500 }), cashier, NOW);

    const again = await closePosShift(closing(shift.clientId, { countedCashMinor: 1 }), cashier, NOW);

    expect(again).toMatchObject({ status: "duplicate", shift: { countedMinor: { CASH: 27_500 } } });
  });

  test("another cashier cannot close it; a manager can", async () => {
    const { shift } = await shiftWithSales();
    const otherCashier = await createStaff();
    const manager = await createStaff("STORE_MANAGER");

    expect(await closePosShift(closing(shift.clientId), otherCashier, NOW)).toMatchObject({ status: "rejected" });
    expect(await closePosShift(closing(shift.clientId), manager, NOW)).toMatchObject({ status: "closed" });
  });

  test("refuses a close time before the shift opened, or an unknown shift", async () => {
    const { cashier, shift } = await shiftWithSales();

    expect(await closePosShift(closing(shift.clientId, { closedAt: "2026-11-02T07:00:00Z" }), cashier, NOW)).toMatchObject({ status: "rejected", error: expect.stringMatching(/clock is behind/) });
    expect(await closePosShift(closing(randomUUID()), cashier, NOW)).toMatchObject({ status: "rejected" });
    expect(await openShiftForTill("T1")).not.toBeNull();
  });
});

describe("the till's catalogue", () => {
  test("lists active options of published products with barcode, photo, bulk prices and live stock", async () => {
    const { product, variant } = await createVariant({ price: 500, stock: 7000 });
    await prisma.productVariant.update({ where: { id: variant.id }, data: { barcode: "6001234567890" } });
    await prisma.priceTier.create({ data: { variantId: variant.id, minQtyMilli: 12_000, unitPriceMinor: 400 } });
    await prisma.productImage.create({ data: { productId: product.id, url: "/uploads/products/water.jpg", alt: "Bottled water" } });
    await prisma.productVariant.create({ data: { productId: product.id, name: "Old size", sku: `OLD-${randomUUID().slice(0, 6)}`, priceMinor: 300, isActive: false } });
    const draft = await createVariant({ price: 900, stock: 1000 });
    await prisma.product.update({ where: { id: draft.product.id }, data: { status: "DRAFT" } });

    const items = await loadPosCatalog();

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      variantId: variant.id,
      productName: product.name,
      barcode: "6001234567890",
      imageUrl: "/uploads/products/water.jpg",
      imageAlt: "Bottled water",
      priceMinor: 500,
      stockMilli: 7000,
      tiers: [{ minQtyMilli: 12_000, unitPriceMinor: 400 }],
    });
    expect(items[0]!.keywords).toContain("6001234567890");
  });
});
