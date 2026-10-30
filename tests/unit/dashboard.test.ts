import { describe, expect, test } from "vitest";
import { compactCedis, greeting, longDay, niceCeiling, periodChange, scaleTicks, sharesOf } from "@/lib/dashboard";

describe("change against the period before", () => {
  test("rises and falls as whole percents", () => {
    expect(periodChange(150, 100)).toEqual({ direction: "up", percent: 50 });
    expect(periodChange(75, 100)).toEqual({ direction: "down", percent: 25 });
    expect(periodChange(1, 3)).toEqual({ direction: "down", percent: 67 });
  });

  test("no percent when the period before had nothing", () => {
    expect(periodChange(500, 0)).toEqual({ direction: "up", percent: null });
    expect(periodChange(0, 0)).toEqual({ direction: "flat", percent: null });
  });

  test("the same figure is flat", () => {
    expect(periodChange(40, 40)).toEqual({ direction: "flat", percent: 0 });
  });
});

describe("greeting in the shop's time", () => {
  test.each([
    ["2026-10-30T06:00:00Z", "Good morning"],
    ["2026-10-30T11:59:00Z", "Good morning"],
    ["2026-10-30T12:00:00Z", "Good afternoon"],
    ["2026-10-30T17:00:00Z", "Good evening"],
    ["2026-10-30T23:30:00Z", "Good evening"],
  ])("%s is %s", (at, expected) => {
    expect(greeting(new Date(at))).toBe(expected);
  });

  test("names the day", () => {
    expect(longDay(new Date("2026-10-30T09:00:00Z"))).toBe("Friday 30 October");
  });
});

describe("chart scale", () => {
  test.each([
    [0, 1],
    [7, 10],
    [12, 20],
    [21, 25],
    [240, 250],
    [251, 500],
    [5000, 5000],
    [730_000, 1_000_000],
  ])("%d rounds up to %d", (value, top) => {
    expect(niceCeiling(value)).toBe(top);
  });

  test("ticks run from zero to a round top", () => {
    expect(scaleTicks(365_400)).toEqual([0, 125_000, 250_000, 375_000, 500_000]);
    expect(scaleTicks(0)).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });
});

describe("short money for an axis", () => {
  test.each([
    [0, "GH₵0"],
    [85_000, "GH₵850"],
    [120_000, "GH₵1.2K"],
    [2_500_000, "GH₵25K"],
    [340_000_000, "GH₵3.4M"],
  ])("%d is %s", (minor, text) => {
    expect(compactCedis(minor)).toBe(text);
  });
});

describe("shares of a whole", () => {
  test("always add up to 100", () => {
    const shares = sharesOf([1, 1, 1]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(100);
    expect(shares).toEqual([34, 33, 33]);
  });

  test("follow the parts", () => {
    expect(sharesOf([300, 100])).toEqual([75, 25]);
    expect(sharesOf([999, 1, 0])).toEqual([100, 0, 0]);
  });

  test("are zero when there is nothing", () => {
    expect(sharesOf([0, 0])).toEqual([0, 0]);
  });
});
