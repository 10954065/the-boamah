import { describe, expect, test } from "vitest";
import { divideRoundHalfUp, formatMoney, minorToDecimalString, parseDecimalToMinor, percentageOf } from "@/lib/money";

describe("money", () => {
  test("formats pesewas as Ghana cedis", () => {
    expect(formatMoney(1250)).toMatch(/12\.50/);
    expect(formatMoney(1250)).toMatch(/GH₵|GHS/);
    expect(formatMoney(0)).toMatch(/0\.00/);
  });

  test("rejects non-integer amounts instead of formatting floats", () => {
    expect(() => formatMoney(12.5)).toThrow(TypeError);
  });

  test("converts minor units to a decimal string without floating point", () => {
    expect(minorToDecimalString(1205)).toBe("12.05");
    expect(minorToDecimalString(-99)).toBe("-0.99");
    expect(minorToDecimalString(100000)).toBe("1000.00");
  });

  test("parses user-entered decimal amounts into minor units", () => {
    expect(parseDecimalToMinor("12")).toBe(1200);
    expect(parseDecimalToMinor("12.5")).toBe(1250);
    expect(parseDecimalToMinor("12.05")).toBe(1205);
    expect(parseDecimalToMinor("1,250.99")).toBe(125099);
    expect(parseDecimalToMinor("0.1")).toBe(10);
  });

  test("returns null for invalid amounts", () => {
    expect(parseDecimalToMinor("")).toBeNull();
    expect(parseDecimalToMinor("-1")).toBeNull();
    expect(parseDecimalToMinor("1.234")).toBeNull();
    expect(parseDecimalToMinor("abc")).toBeNull();
  });

  test("rounds integer division half away from zero", () => {
    expect(divideRoundHalfUp(5, 2)).toBe(3);
    expect(divideRoundHalfUp(4, 3)).toBe(1);
    expect(divideRoundHalfUp(-5, 2)).toBe(-3);
    expect(() => divideRoundHalfUp(1, 0)).toThrow(RangeError);
  });

  test("applies basis-point percentages exactly", () => {
    expect(percentageOf(10000, 1000)).toBe(1000); // 10% of 100.00
    expect(percentageOf(999, 1500)).toBe(150); // 15% of 9.99 = 1.4985 -> 1.50
    expect(percentageOf(1, 5000)).toBe(1); // half a pesewa rounds up
  });
});
