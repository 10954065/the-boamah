import { describe, expect, test } from "vitest";
import { countDifferences, formatReceiptNumber, parseReceiptNumber, posSaleUploadSchema, posShiftCloseSchema, settleTender, summariseShift } from "@/lib/pos";

describe("receipt numbers", () => {
  test("are the till code and a six-digit sequence", () => {
    expect(formatReceiptNumber("T1", 231)).toBe("T1-000231");
    expect(parseReceiptNumber("T1-000231")).toEqual({ tillCode: "T1", sequence: 231 });
  });

  test("reject bad till codes, sequences and formats", () => {
    expect(() => formatReceiptNumber("t1", 1)).toThrow();
    expect(() => formatReceiptNumber("T1", 0)).toThrow();
    expect(() => formatReceiptNumber("T1", 1_000_000)).toThrow();
    expect(parseReceiptNumber("T1-000000")).toBeNull();
    expect(parseReceiptNumber("T1-231")).toBeNull();
    expect(parseReceiptNumber("RIV-000231-X")).toBeNull();
  });
});

describe("settling a payment", () => {
  test("cash over the total gives change", () => {
    expect(settleTender(7500, [{ method: "CASH", amountMinor: 10_000 }])).toEqual({ ok: true, paidMinor: 10_000, changeMinor: 2500 });
  });

  test("a split of mobile money and cash", () => {
    expect(
      settleTender(7500, [
        { method: "MOMO", amountMinor: 5000, reference: "MP241102.0930" },
        { method: "CASH", amountMinor: 5000 },
      ]),
    ).toEqual({ ok: true, paidMinor: 10_000, changeMinor: 2500 });
  });

  test("mobile money and card must be exact and cannot give change", () => {
    expect(settleTender(7500, [{ method: "CARD", amountMinor: 8000 }])).toMatchObject({ ok: false, error: expect.stringMatching(/Only cash gives change/) });
    expect(settleTender(7500, [{ method: "CARD", amountMinor: 7500 }])).toEqual({ ok: true, paidMinor: 7500, changeMinor: 0 });
  });

  test("refuses short payments, missing mobile money IDs, repeats and empty tender", () => {
    expect(settleTender(7500, [{ method: "CASH", amountMinor: 5000 }])).toMatchObject({ ok: false, error: expect.stringMatching(/25\.00 still to pay/) });
    expect(settleTender(7500, [{ method: "MOMO", amountMinor: 7500, reference: "  " }])).toMatchObject({ ok: false, error: expect.stringMatching(/transaction ID/) });
    expect(
      settleTender(7500, [
        { method: "CASH", amountMinor: 5000 },
        { method: "CASH", amountMinor: 2500 },
      ]),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/only be used once/) });
    expect(settleTender(7500, [])).toMatchObject({ ok: false });
    expect(settleTender(7500, [{ method: "CASH", amountMinor: 0 }])).toMatchObject({ ok: false });
  });
});

describe("sale upload format", () => {
  const valid = {
    clientId: "1f0c6f5e-3b9a-4c1e-9d2a-7b6f2f0c9a11",
    receiptNumber: "T1-000001",
    tillCode: "T1",
    cashierId: "user_1",
    soldAt: "2026-11-02T09:30:00.000Z",
    items: [{ variantId: "v1", quantityMilli: 1500, unitPriceMinor: 2500 }],
    payments: [{ method: "CASH", amountMinor: 5000 }],
  };

  test("accepts a well-formed sale", () => {
    expect(posSaleUploadSchema.safeParse(valid).success).toBe(true);
  });

  test("rejects malformed ids, quantities, prices and tender", () => {
    const bad = [
      { ...valid, clientId: "not-a-uuid" },
      { ...valid, receiptNumber: "T1-1" },
      { ...valid, soldAt: "yesterday" },
      { ...valid, items: [] },
      { ...valid, items: [{ variantId: "v1", quantityMilli: 0, unitPriceMinor: 2500 }] },
      { ...valid, items: [{ variantId: "v1", quantityMilli: 1.5, unitPriceMinor: 2500 }] },
      { ...valid, items: [{ variantId: "v1", quantityMilli: 1000, unitPriceMinor: -1 }] },
      { ...valid, payments: [{ method: "CHEQUE", amountMinor: 5000 }] },
    ];
    for (const sale of bad) expect(posSaleUploadSchema.safeParse(sale).success).toBe(false);
  });
});

describe("shift totals", () => {
  test("cash expected is the float plus cash taken less change; other methods as paid", () => {
    const summary = summariseShift(20_000, [
      { totalMinor: 7500, changeMinor: 2500, payments: [{ method: "CASH", amountMinor: 10_000 }] },
      { totalMinor: 9000, changeMinor: 1000, payments: [{ method: "MOMO", amountMinor: 5000 }, { method: "CASH", amountMinor: 5000 }] },
      { totalMinor: 3000, changeMinor: 0, payments: [{ method: "CARD", amountMinor: 3000 }] },
    ]);
    expect(summary).toEqual({
      salesCount: 3,
      salesTotalMinor: 19_500,
      takenMinor: { CASH: 11_500, MOMO: 5000, CARD: 3000 },
      refundsCount: 0,
      refundedMinor: { CASH: 0, MOMO: 0, CARD: 0 },
      voidsCount: 0,
      voidedTotalMinor: 0,
      expectedMinor: { CASH: 31_500, MOMO: 5000, CARD: 3000 },
    });
  });

  test("an empty shift expects just the float", () => {
    expect(summariseShift(15_000, []).expectedMinor).toEqual({ CASH: 15_000, MOMO: 0, CARD: 0 });
  });

  test("differences are counted minus expected, so money missing is below zero", () => {
    expect(countDifferences({ CASH: 31_500, MOMO: 5000, CARD: 3000 }, { CASH: 31_000, MOMO: 5000, CARD: 3500 })).toEqual({ CASH: -500, MOMO: 0, CARD: 500 });
  });

  test("a close needs whole, non negative counts", () => {
    const close = { clientId: "1f0c6f5e-3b9a-4c1e-9d2a-7b6f2f0c9a11", closedAt: "2026-11-02T18:00:00.000Z", countedCashMinor: 31_000, countedMomoMinor: 0, countedCardMinor: 0 };
    expect(posShiftCloseSchema.safeParse(close).success).toBe(true);
    expect(posShiftCloseSchema.safeParse({ ...close, countedCashMinor: -1 }).success).toBe(false);
    expect(posShiftCloseSchema.safeParse({ ...close, countedMomoMinor: 1.5 }).success).toBe(false);
  });
});
