import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import type { PosSaleUpload } from "@/lib/pos";
import { recordPosSale, recordPosSales } from "@/server/pos/sales";
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
    const again = await recordPosSales([upload, upload], NOW);

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

    expect(clash).toMatchObject({ status: "rejected", error: expect.stringMatching(/already used/) });
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
