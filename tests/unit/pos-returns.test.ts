import { describe, expect, test } from "vitest";
import {
  formatRefundNumber,
  posReturnSchema,
  receiptForRecord,
  receiptNumberFrom,
  refundForLine,
  refundMethodProblem,
  returnProblem,
  returnQuantityProblem,
  saleReturnState,
  voidCheckOf,
  voidProblem,
  type PosSaleLineRecord,
  type PosSaleRecord,
} from "@/lib/pos-returns";
import { periodPresets, reportPeriod } from "@/lib/pos-report";
import { heldSaleOf, parseHeldSales, priceSale, resumeHeldSale, type PosCatalogItem } from "@/lib/pos-till";

const SHIFT = "11111111-1111-4111-8111-111111111111";
const OTHER_SHIFT = "22222222-2222-4222-8222-222222222222";

function line(overrides: Partial<PosSaleLineRecord> = {}): PosSaleLineRecord {
  return {
    id: "line-1",
    productName: "Tomatoes",
    variantName: "Loose",
    unit: "KG",
    quantityMilli: 1500,
    unitPriceMinor: 1999,
    lineTotalMinor: 2999,
    returnedMilli: 0,
    refundedMinor: 0,
    ...overrides,
  };
}

function record(overrides: Partial<PosSaleRecord> = {}): PosSaleRecord {
  return {
    id: "sale-1",
    clientId: "client-1",
    receiptNumber: "T1-000231",
    tillCode: "T1",
    cashierName: "Ama Mensah",
    soldAt: "2026-10-30T09:00:00.000Z",
    shiftClientId: SHIFT,
    shiftOpen: true,
    status: "COMPLETED",
    totalMinor: 2999,
    paidMinor: 3000,
    changeMinor: 1,
    payments: [{ method: "CASH", amountMinor: 3000, reference: null }],
    lines: [line()],
    voided: null,
    refunds: [],
    ...overrides,
  };
}

describe("refunds for returned goods", () => {
  test("part of a line gives back the price charged for that quantity", () => {
    expect(refundForLine(line(), 500)).toBe(1000); // 0.5 kg at 19.99, rounded
  });

  test("the last of a line gives back exactly what is left of its total", () => {
    const firstPart = line({ returnedMilli: 500, refundedMinor: 1000 });
    expect(refundForLine(firstPart, 1000)).toBe(1999);
    expect(1000 + refundForLine(firstPart, 1000)).toBe(line().lineTotalMinor);
  });

  test("never gives back more than is left", () => {
    expect(refundForLine(line({ returnedMilli: 0, refundedMinor: 2900 }), 1000)).toBe(99);
  });
});

describe("what can come back", () => {
  test("whole units only for goods sold by the unit", () => {
    const rice = line({ productName: "Rice", unit: "BAG", quantityMilli: 3000, unitPriceMinor: 45_000, lineTotalMinor: 135_000 });
    expect(returnQuantityProblem(rice, 1500)).toBe("Rice comes back in whole bags.");
    expect(returnQuantityProblem(rice, 2000)).toBeNull();
  });

  test("no more than is still out, and nothing once it is all back", () => {
    expect(returnQuantityProblem(line({ returnedMilli: 1000 }), 750)).toBe("Only 0.5 kg of Tomatoes can still be returned.");
    expect(returnQuantityProblem(line({ returnedMilli: 1500 }), 100)).toBe("Tomatoes has already been returned.");
    expect(returnQuantityProblem(line(), 0)).toBe("Enter how much Tomatoes is coming back.");
  });

  test("a sale is part or all returned", () => {
    expect(saleReturnState(record())).toBe("none");
    expect(saleReturnState(record({ lines: [line({ returnedMilli: 500 })] }))).toBe("part");
    expect(saleReturnState(record({ lines: [line({ returnedMilli: 1500 })] }))).toBe("all");
    expect(returnProblem(record({ lines: [line({ returnedMilli: 1500 })] }))).toBe("Everything from this sale has already been returned.");
    expect(returnProblem(record({ status: "VOIDED" }))).toBe("This sale was voided, so there is nothing to return.");
    expect(returnProblem(record())).toBeNull();
  });

  test("a mobile money refund needs its transaction ID", () => {
    expect(refundMethodProblem("MOMO", "  ")).toBe("Enter the mobile money transaction ID of the refund.");
    expect(refundMethodProblem("MOMO", "TX123")).toBeNull();
    expect(refundMethodProblem("CASH", null)).toBeNull();
  });

  test("a return names at least one line and needs a reason", () => {
    const base = {
      clientId: "33333333-3333-4333-8333-333333333333",
      saleId: "sale-1",
      tillCode: "T1",
      shiftClientId: SHIFT,
      items: [{ saleItemId: "line-1", quantityMilli: 500, restock: true }],
      method: "CASH",
    };
    expect(posReturnSchema.safeParse({ ...base, reason: "Damaged or faulty" }).success).toBe(true);
    expect(posReturnSchema.safeParse({ ...base, reason: " " }).success).toBe(false);
    expect(posReturnSchema.safeParse({ ...base, reason: "Damaged", items: [] }).success).toBe(false);
  });
});

describe("voiding", () => {
  test("only a completed sale of the shift open now, with nothing returned", () => {
    expect(voidProblem(voidCheckOf(record()), SHIFT)).toBeNull();
    expect(voidProblem(voidCheckOf(record()), OTHER_SHIFT)).toMatch(/^Only sales from the shift open now/);
    expect(voidProblem(voidCheckOf(record({ shiftOpen: false })), SHIFT)).toMatch(/^Only sales from the shift open now/);
    expect(voidProblem(voidCheckOf(record({ status: "VOIDED" })), SHIFT)).toBe("This sale has already been voided.");
    const returned = record({ refunds: [{} as PosSaleRecord["refunds"][number]] });
    expect(voidProblem(voidCheckOf(returned), SHIFT)).toMatch(/^Items from this sale have been returned/);
  });
});

describe("finding a receipt", () => {
  test("by its number on this till, in short or in full", () => {
    expect(receiptNumberFrom("231", "T1")).toBe("T1-000231");
    expect(receiptNumberFrom(" t2-45 ", "T1")).toBe("T2-000045");
    expect(receiptNumberFrom("T1-000231", "T1")).toBe("T1-000231");
    expect(receiptNumberFrom("0", "T1")).toBeNull();
    expect(receiptNumberFrom("rice", "T1")).toBeNull();
    expect(receiptNumberFrom("T1231", "T1")).toBeNull();
  });

  test("refund slips are numbered like receipts", () => {
    expect(formatRefundNumber(12)).toBe("RF-000012");
  });

  test("a recorded sale prints as its receipt", () => {
    const receipt = receiptForRecord(record());
    expect(receipt).toMatchObject({ receiptNumber: "T1-000231", cashierName: "Ama Mensah", totalMinor: 2999, changeMinor: 1 });
    expect(receipt.lines).toEqual([{ name: "Tomatoes", detail: "Loose", unit: "KG", quantityMilli: 1500, unitPriceMinor: 1999, lineTotalMinor: 2999, savingMinor: 0 }]);
  });
});

function catalogItem(overrides: Partial<PosCatalogItem> = {}): PosCatalogItem {
  return {
    variantId: "v-rice",
    productName: "Jasmine Rice",
    variantName: "5 kg bag",
    sku: "RICE-5KG",
    barcode: null,
    unit: "BAG",
    categoryId: "c-grains",
    categoryName: "Rice & Grains",
    imageUrl: null,
    imageAlt: "Jasmine Rice",
    priceMinor: 45_000,
    salePriceMinor: null,
    saleEndsAt: null,
    tiers: [],
    stockMilli: 10_000,
    lowStockMilli: 3000,
    keywords: "jasmine rice",
    ...overrides,
  };
}

describe("sales on hold", () => {
  const NOW = new Date("2026-10-30T09:00:00Z");
  const rice = catalogItem();
  const oil = catalogItem({ variantId: "v-oil", productName: "Frytol Oil", variantName: "1 litre", priceMinor: 3500 });

  test("keep what was picked and pick up again at today's prices", () => {
    const held = heldSaleOf(priceSale([{ item: rice, quantityMilli: 2000 }, { item: oil, quantityMilli: 1000 }], NOW), "  Lady in blue  ", "Ama", NOW);
    expect(held).toMatchObject({ note: "Lady in blue", cashierName: "Ama", totalMinor: 93_500, heldAt: NOW.toISOString() });

    const dearer = { ...rice, priceMinor: 47_000 };
    const resumed = resumeHeldSale(held, [dearer]);
    expect(resumed.lines).toEqual([{ item: dearer, quantityMilli: 2000 }]);
    expect(resumed.missing).toEqual(["Frytol Oil (1 litre)"]);
  });

  test("an empty note is no note, and unreadable stored holds are dropped", () => {
    const held = heldSaleOf(priceSale([{ item: rice, quantityMilli: 1000 }], NOW), " ", "Ama", NOW);
    expect(held.note).toBeNull();
    expect(parseHeldSales([held, { id: "broken" }, "nonsense"])).toEqual([held]);
    expect(parseHeldSales(null)).toEqual([]);
  });
});

describe("report periods", () => {
  const NOW = new Date("2026-10-30T15:20:00Z");

  test("today when nothing is asked for, as whole days in Ghana time", () => {
    expect(reportPeriod(undefined, undefined, NOW)).toEqual({
      from: "2026-10-30",
      to: "2026-10-30",
      start: new Date("2026-10-30T00:00:00Z"),
      end: new Date("2026-10-31T00:00:00Z"),
      days: 1,
    });
  });

  test("puts the days in order, ignores nonsense, and covers a year at most", () => {
    expect(reportPeriod("2026-10-30", "2026-10-24", NOW)).toMatchObject({ from: "2026-10-24", to: "2026-10-30", days: 7 });
    expect(reportPeriod("2026-02-30", "rubbish", NOW)).toMatchObject({ from: "2026-10-30", to: "2026-10-30" });
    expect(reportPeriod("2020-01-01", "2026-10-30", NOW)).toMatchObject({ from: "2025-10-30", to: "2026-10-30", days: 366 });
  });

  test("offers today, yesterday, a week and a month", () => {
    expect(periodPresets(NOW).map((p) => [p.label, p.from, p.to])).toEqual([
      ["Today", "2026-10-30", "2026-10-30"],
      ["Yesterday", "2026-10-29", "2026-10-29"],
      ["Last 7 days", "2026-10-24", "2026-10-30"],
      ["Last 30 days", "2026-10-01", "2026-10-30"],
    ]);
  });
});
