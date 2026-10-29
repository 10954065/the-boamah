import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import type { PosSaleUpload } from "@/lib/pos";
import { recordPosSale, recordPosSales } from "@/server/pos/sales";
import { closePosShift, openPosShift } from "@/server/pos/shifts";
import { createStaff, createTill, createVariant, resetDatabase } from "./factories";

beforeEach(resetDatabase);

const NOW = new Date("2026-11-02T10:00:00Z");

function sale(overrides: Partial<PosSaleUpload> & Pick<PosSaleUpload, "cashierId" | "items" | "payments">): PosSaleUpload {
  return {
    clientId: randomUUID(),
    receiptNumber: "T1-000001",
    tillCode: "T1",
    shiftClientId: null,
    soldAt: "2026-11-02T09:30:00Z",
    ...overrides,
  };
}

async function stockOf(variantId: string): Promise<number> {
  return (await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stockMilli;
}

describe("recording a till sale", () => {
  test("records items, payments and change, takes the stock and logs the movement", async () => {
    await createTill();
    const cashier = await createStaff();
    const { variant } = await createVariant({ price: 2500, stock: 10_000 });

    const result = await recordPosSale(
      sale({ cashierId: cashier.id, items: [{ variantId: variant.id, quantityMilli: 3000, unitPriceMinor: 2500 }], payments: [{ method: "CASH", amountMinor: 10_000 }] }),
      NOW,
    );

    expect(result).toMatchObject({ status: "recorded", receiptNumber: "T1-000001", shortfall: false, priceDifference: false });
    const saved = await prisma.posSale.findFirstOrThrow({ include: { items: true, payments: true, movements: true } });
    expect(saved).toMatchObject({ totalMinor: 7500, paidMinor: 10_000, changeMinor: 2500, cashierId: cashier.id });
    expect(saved.items[0]).toMatchObject({ quantityMilli: 3000, unitPriceMinor: 2500, listUnitPriceMinor: 2500, lineTotalMinor: 7500, shortfallMilli: 0 });
    expect(saved.payments).toEqual([expect.objectContaining({ method: "CASH", amountMinor: 10_000 })]);
    expect(saved.movements).toEqual([expect.objectContaining({ type: "POS_SALE", deltaMilli: -3000, balanceAfterMilli: 7000, actorId: cashier.id })]);
    expect(await stockOf(variant.id)).toBe(7000);
    expect((await prisma.posTill.findUniqueOrThrow({ where: { code: "T1" } })).lastReceiptSeq).toBe(1);
  });

  test("uploading the same sale again changes nothing", async () => {
    await createTill();
    const cashier = await createStaff();
    const { variant } = await createVariant({ price: 2500, stock: 10_000 });
    const upload = sale({ cashierId: cashier.id, items: [{ variantId: variant.id, quantityMilli: 2000, unitPriceMinor: 2500 }], payments: [{ method: "CARD", amountMinor: 5000 }] });

    const first = await recordPosSale(upload, NOW);
    const again = await recordPosSales([upload, upload], cashier, NOW);

    expect(first.status).toBe("recorded");
    expect(again.map((r) => r.status)).toEqual(["duplicate", "duplicate"]);
    expect(await prisma.posSale.count()).toBe(1);
    expect(await stockOf(variant.id)).toBe(8000);
  });

  test("selling more than the recorded stock empties it and records the shortfall", async () => {
    await createTill();
    const cashier = await createStaff();
    const { variant } = await createVariant({ price: 1000, stock: 2000 });
    const { variant: none } = await createVariant({ price: 500, stock: 0 });

    const result = await recordPosSale(
      sale({
        cashierId: cashier.id,
        items: [
          { variantId: variant.id, quantityMilli: 5000, unitPriceMinor: 1000 },
          { variantId: none.id, quantityMilli: 1000, unitPriceMinor: 500 },
        ],
        payments: [{ method: "CASH", amountMinor: 5500 }],
      }),
      NOW,
    );

    expect(result).toMatchObject({ status: "recorded", shortfall: true });
    expect(await stockOf(variant.id)).toBe(0);
    expect(await stockOf(none.id)).toBe(0);
    const items = await prisma.posSaleItem.findMany();
    expect(items.find((i) => i.variantId === variant.id)?.shortfallMilli).toBe(3000);
    expect(items.find((i) => i.variantId === none.id)?.shortfallMilli).toBe(1000);
    // Only the stock that was really there is logged as taken.
    const movements = await prisma.inventoryMovement.findMany({ where: { type: "POS_SALE" } });
    expect(movements).toEqual([expect.objectContaining({ variantId: variant.id, deltaMilli: -2000, balanceAfterMilli: 0 })]);
    expect(movements[0]!.reason).toContain("3 items more than recorded stock");
  });

  test("flags a price that differs from the shelf price at the time of sale", async () => {
    await createTill();
    const cashier = await createStaff();
    const { variant } = await createVariant({ price: 2500, stock: 10_000 });

    const result = await recordPosSale(
      sale({ cashierId: cashier.id, items: [{ variantId: variant.id, quantityMilli: 1000, unitPriceMinor: 2000 }], payments: [{ method: "CASH", amountMinor: 2000 }] }),
      NOW,
    );

    expect(result).toMatchObject({ status: "recorded", priceDifference: true });
    expect((await prisma.posSaleItem.findFirstOrThrow()).listUnitPriceMinor).toBe(2500);
  });

  test("a sale price that ended after an offline sale still counts as the shelf price", async () => {
    await createTill();
    const cashier = await createStaff();
    const { variant } = await createVariant({ price: 2500, sale: 2000, stock: 10_000 });
    await prisma.productVariant.update({ where: { id: variant.id }, data: { saleEndsAt: new Date("2026-11-02T09:45:00Z") } });

    const result = await recordPosSale(
      sale({ cashierId: cashier.id, soldAt: "2026-11-02T09:30:00Z", items: [{ variantId: variant.id, quantityMilli: 1000, unitPriceMinor: 2000 }], payments: [{ method: "CASH", amountMinor: 2000 }] }),
      NOW,
    );

    expect(result).toMatchObject({ status: "recorded", priceDifference: false });
  });

  test("bulk prices count as the shelf price for large quantities", async () => {
    await createTill();
    const cashier = await createStaff();
    const { variant } = await createVariant({ price: 2500, stock: 20_000 });
    await prisma.priceTier.create({ data: { variantId: variant.id, minQtyMilli: 5000, unitPriceMinor: 2000 } });

    const result = await recordPosSale(
      sale({ cashierId: cashier.id, items: [{ variantId: variant.id, quantityMilli: 6000, unitPriceMinor: 2000 }], payments: [{ method: "MOMO", amountMinor: 12_000, reference: "MP241102.0930.A12345" }] }),
      NOW,
    );

    expect(result).toMatchObject({ status: "recorded", priceDifference: false });
    expect((await prisma.posPayment.findFirstOrThrow()).reference).toBe("MP241102.0930.A12345");
  });
});

describe("sales the server refuses", () => {
  async function setup() {
    await createTill();
    const cashier = await createStaff();
    const { variant } = await createVariant({ price: 2500, stock: 10_000 });
    const line = [{ variantId: variant.id, quantityMilli: 1000, unitPriceMinor: 2500 }];
    return { cashier, variant, line };
  }

  async function expectRejected(upload: PosSaleUpload, message: RegExp, variantId: string) {
    const result = await recordPosSale(upload, NOW);
    expect(result.status).toBe("rejected");
    if (result.status === "rejected") expect(result.error).toMatch(message);
    expect(await prisma.posSale.count()).toBe(0);
    expect(await stockOf(variantId)).toBe(10_000);
  }

  test("underpaid, or mobile money without a transaction ID", async () => {
    const { cashier, variant, line } = await setup();
    await expectRejected(sale({ cashierId: cashier.id, items: line, payments: [{ method: "CASH", amountMinor: 2000 }] }), /still to pay/, variant.id);
    await expectRejected(sale({ cashierId: cashier.id, items: line, payments: [{ method: "MOMO", amountMinor: 2500 }] }), /transaction ID/, variant.id);
  });

  test("an unknown or switched-off till, or a customer as cashier", async () => {
    const { cashier, variant, line } = await setup();
    await createTill("T2", false);
    const customer = await createStaff("CUSTOMER");
    const paid = [{ method: "CASH" as const, amountMinor: 2500 }];
    await expectRejected(sale({ cashierId: cashier.id, tillCode: "T9", receiptNumber: "T9-000001", items: line, payments: paid }), /not set up/, variant.id);
    await expectRejected(sale({ cashierId: cashier.id, tillCode: "T2", receiptNumber: "T2-000001", items: line, payments: paid }), /switched off/, variant.id);
    await expectRejected(sale({ cashierId: customer.id, items: line, payments: paid }), /not allowed/, variant.id);
  });

  test("a receipt number from another till, or a clock far ahead", async () => {
    const { cashier, variant, line } = await setup();
    const paid = [{ method: "CASH" as const, amountMinor: 2500 }];
    await expectRejected(sale({ cashierId: cashier.id, receiptNumber: "T2-000001", items: line, payments: paid }), /does not belong/, variant.id);
    await expectRejected(sale({ cashierId: cashier.id, soldAt: "2026-11-02T11:00:00Z", items: line, payments: paid }), /clock is ahead/, variant.id);
  });

  test("a receipt number already used by a different sale", async () => {
    const { cashier, variant, line } = await setup();
    const paid = [{ method: "CASH" as const, amountMinor: 2500 }];
    expect((await recordPosSale(sale({ cashierId: cashier.id, items: line, payments: paid }), NOW)).status).toBe("recorded");

    const clash = await recordPosSale(sale({ cashierId: cashier.id, items: line, payments: paid }), NOW);

    expect(clash).toMatchObject({ status: "rejected", error: expect.stringMatching(/already used/), reason: "receipt-used", lastReceiptSeq: 1 });
    expect(await prisma.posSale.count()).toBe(1);
    expect(await stockOf(variant.id)).toBe(9000);
  });

  test("an item that no longer exists", async () => {
    const { cashier, variant } = await setup();
    await expectRejected(
      sale({ cashierId: cashier.id, items: [{ variantId: "gone", quantityMilli: 1000, unitPriceMinor: 2500 }], payments: [{ method: "CASH", amountMinor: 2500 }] }),
      /no longer in the catalogue/,
      variant.id,
    );
  });
});

describe("who and which shift a sale belongs to", () => {
  const paid = [{ method: "CASH" as const, amountMinor: 2500 }];

  async function setup() {
    await createTill();
    const cashier = await createStaff();
    const { variant } = await createVariant({ price: 2500, stock: 10_000 });
    const line = [{ variantId: variant.id, quantityMilli: 1000, unitPriceMinor: 2500 }];
    const opened = await openPosShift({ clientId: randomUUID(), tillCode: "T1", openedAt: "2026-11-02T08:00:00Z", openingFloatMinor: 0 }, cashier, NOW);
    if (opened.status === "rejected") throw new Error(opened.error);
    return { cashier, line, shift: opened.shift };
  }

  test("a sale goes into its cashier's open shift on the till", async () => {
    const { cashier, line, shift } = await setup();

    const result = await recordPosSale(sale({ cashierId: cashier.id, shiftClientId: shift.clientId, items: line, payments: paid }), NOW);

    expect(result.status).toBe("recorded");
    expect((await prisma.posSale.findFirstOrThrow({ include: { shift: true } })).shift?.clientId).toBe(shift.clientId);
  });

  test("refuses another cashier's shift and a shift that does not exist", async () => {
    const { line, shift } = await setup();
    const other = await createStaff();

    expect(await recordPosSale(sale({ cashierId: other.id, shiftClientId: shift.clientId, items: line, payments: paid }), NOW)).toMatchObject({
      status: "rejected",
      error: expect.stringMatching(/another cashier's shift/),
    });
    expect(await recordPosSale(sale({ cashierId: other.id, shiftClientId: randomUUID(), items: line, payments: paid }), NOW)).toMatchObject({
      status: "rejected",
      error: expect.stringMatching(/not found/),
    });
    expect(await prisma.posSale.count()).toBe(0);
  });

  test("a shift closed before the sale refuses it; a sale made before the close still counts", async () => {
    const { cashier, line, shift } = await setup();
    await closePosShift({ clientId: shift.clientId, closedAt: "2026-11-02T09:00:00Z", countedCashMinor: 0, countedMomoMinor: 0, countedCardMinor: 0 }, cashier, NOW);

    const after = await recordPosSale(sale({ cashierId: cashier.id, shiftClientId: shift.clientId, soldAt: "2026-11-02T09:30:00Z", items: line, payments: paid }), NOW);
    const before = await recordPosSale(
      sale({ cashierId: cashier.id, shiftClientId: shift.clientId, receiptNumber: "T1-000002", soldAt: "2026-11-02T08:45:00Z", items: line, payments: paid }),
      NOW,
    );

    expect(after).toMatchObject({ status: "rejected", reason: "shift-closed" });
    expect(before.status).toBe("recorded");
  });

  test("a cashier sends only their own sales; a manager may send anyone's", async () => {
    const { cashier, line } = await setup();
    const otherCashier = await createStaff();
    const manager = await createStaff("STORE_MANAGER");
    const upload = sale({ cashierId: cashier.id, items: line, payments: paid });

    const byOther = await recordPosSales([upload], otherCashier, NOW);
    expect(byOther).toEqual([expect.objectContaining({ status: "rejected", reason: "other-cashier" })]);
    expect(await prisma.posSale.count()).toBe(0);

    const byManager = await recordPosSales([upload], manager, NOW);
    expect(byManager).toEqual([expect.objectContaining({ status: "recorded" })]);
  });

  test("refuses a suspended cashier and a receipt number far ahead of the till", async () => {
    const { cashier, line } = await setup();
    await prisma.user.update({ where: { id: cashier.id }, data: { status: "SUSPENDED" } });
    expect(await recordPosSale(sale({ cashierId: cashier.id, items: line, payments: paid }), NOW)).toMatchObject({ status: "rejected", error: expect.stringMatching(/not allowed/) });

    await prisma.user.update({ where: { id: cashier.id }, data: { status: "ACTIVE" } });
    expect(await recordPosSale(sale({ cashierId: cashier.id, receiptNumber: "T1-999999", items: line, payments: paid }), NOW)).toMatchObject({
      status: "rejected",
      error: expect.stringMatching(/far ahead/),
    });
    expect((await prisma.posTill.findUniqueOrThrow({ where: { code: "T1" } })).lastReceiptSeq).toBe(0);
  });
});
