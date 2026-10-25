import { describe, expect, test } from "vitest";
import {
  checkQuantity,
  clampToValidQuantity,
  formatQuantity,
  lineTotalMinor,
  milliToDecimalString,
  parseDecimalToMilli,
} from "@/lib/quantity";

const perItem = { stepMilli: 1000, minQtyMilli: 1000, maxQtyMilli: 10_000 };
const byWeight = { stepMilli: 500, minQtyMilli: 500, maxQtyMilli: null };

describe("quantity formatting", () => {
  test("formats milli-units for weight and count units", () => {
    expect(milliToDecimalString(1500)).toBe("1.5");
    expect(milliToDecimalString(250)).toBe("0.25");
    expect(formatQuantity(1000, "KG")).toBe("1 kg");
    expect(formatQuantity(2500, "KG")).toBe("2.5 kg");
    expect(formatQuantity(1000, "BOTTLE")).toBe("1 bottle");
    expect(formatQuantity(3000, "BOTTLE")).toBe("3 bottles");
  });

  test("parses decimal quantities without floats", () => {
    expect(parseDecimalToMilli("1.5")).toBe(1500);
    expect(parseDecimalToMilli("2")).toBe(2000);
    expect(parseDecimalToMilli("0.125")).toBe(125);
    expect(parseDecimalToMilli("1.2345")).toBeNull();
    expect(parseDecimalToMilli("-1")).toBeNull();
  });
});

describe("line totals", () => {
  test("multiplies unit price by quantity in milli-units", () => {
    expect(lineTotalMinor(1500, 2000)).toBe(3000); // 2 × GH₵15.00
    expect(lineTotalMinor(1299, 1500)).toBe(1949); // 1.5 kg × 12.99 = 19.485 -> 19.49
    expect(lineTotalMinor(1000, 500)).toBe(500);
  });
});

describe("checkQuantity", () => {
  test("accepts valid whole-unit quantities", () => {
    expect(checkQuantity(3000, perItem, "ITEM", 50_000)).toEqual({ ok: true });
  });

  test("rejects fractional quantities for whole units", () => {
    const result = checkQuantity(1500, perItem, "ITEM", 50_000);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("BAD_STEP");
  });

  test("accepts half-kilogram steps for weighed products", () => {
    expect(checkQuantity(1500, byWeight, "KG", 20_000)).toEqual({ ok: true });
    const bad = checkQuantity(1250, byWeight, "KG", 20_000);
    expect(bad.ok).toBe(false);
  });

  test("enforces minimum, maximum and stock", () => {
    expect(checkQuantity(0, perItem, "ITEM").ok).toBe(false);
    const max = checkQuantity(11_000, perItem, "ITEM", 50_000);
    expect(!max.ok && max.reason).toBe("ABOVE_MAX");
    const stock = checkQuantity(3000, perItem, "ITEM", 2000);
    expect(!stock.ok && stock.reason).toBe("INSUFFICIENT_STOCK");
    const out = checkQuantity(1000, perItem, "ITEM", 0);
    expect(!out.ok && out.message).toMatch(/out of stock/i);
  });

  test("rejects non-integer milli quantities", () => {
    expect(checkQuantity(1000.5, perItem, "ITEM").ok).toBe(false);
  });
});

describe("clampToValidQuantity", () => {
  test("returns the largest valid quantity within a limit", () => {
    expect(clampToValidQuantity(2700, byWeight)).toBe(2500);
    expect(clampToValidQuantity(25_000, perItem)).toBe(10_000);
    expect(clampToValidQuantity(400, byWeight)).toBeNull();
  });
});
