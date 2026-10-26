import { describe, expect, test } from "vitest";
import {
  computeDeliveryFee,
  computeTotals,
  discountPercent,
  effectiveUnitPrice,
  evaluateCoupon,
  priceLines,
  unitPriceForQuantity,
  usefulTiers,
  type CouponRule,
  type DeliveryZoneRule,
} from "@/lib/pricing";

const now = new Date("2026-10-25T12:00:00Z");

const lines = priceLines([
  { variantId: "v-rice", productId: "p-rice", categoryId: "c-grains", unitPriceMinor: 15000, quantityMilli: 2000 },
  { variantId: "v-tom", productId: "p-tom", categoryId: "c-veg", unitPriceMinor: 1200, quantityMilli: 1500 },
]);
// rice 300.00 + tomatoes 18.00 = 318.00

function coupon(overrides: Partial<CouponRule> = {}): CouponRule {
  return {
    code: "SAVE10",
    type: "PERCENTAGE",
    value: 1000,
    maxDiscountMinor: null,
    minOrderMinor: 0,
    scope: "ALL",
    productIds: [],
    categoryIds: [],
    startsAt: null,
    endsAt: null,
    usageLimit: null,
    usedCount: 0,
    perCustomerLimit: null,
    isActive: true,
    ...overrides,
  };
}

describe("effective prices", () => {
  test("uses the sale price only when it is lower than the regular price", () => {
    expect(effectiveUnitPrice({ priceMinor: 1000, salePriceMinor: 800 })).toBe(800);
    expect(effectiveUnitPrice({ priceMinor: 1000, salePriceMinor: 1200 })).toBe(1000);
    expect(effectiveUnitPrice({ priceMinor: 1000, salePriceMinor: null })).toBe(1000);
  });

  test("reports a whole discount percentage for badges", () => {
    expect(discountPercent({ priceMinor: 1000, salePriceMinor: 750 })).toBe(25);
    expect(discountPercent({ priceMinor: 1000, salePriceMinor: null })).toBeNull();
  });
});

describe("evaluateCoupon", () => {
  test("applies a percentage discount to the whole order", () => {
    const result = evaluateCoupon(coupon(), lines, now, 0);
    expect(result).toEqual({ ok: true, discountMinor: 3180, eligibleSubtotalMinor: 31800 });
  });

  test("caps percentage discounts at the configured maximum", () => {
    const result = evaluateCoupon(coupon({ maxDiscountMinor: 2000 }), lines, now, 0);
    expect(result.ok && result.discountMinor).toBe(2000);
  });

  test("never discounts more than the eligible subtotal", () => {
    const result = evaluateCoupon(coupon({ type: "FIXED", value: 999_999 }), lines, now, 0);
    expect(result.ok && result.discountMinor).toBe(31800);
  });

  test("limits category-specific coupons to matching lines", () => {
    const result = evaluateCoupon(coupon({ scope: "CATEGORIES", categoryIds: ["c-veg"] }), lines, now, 0);
    expect(result).toEqual({ ok: true, discountMinor: 180, eligibleSubtotalMinor: 1800 });
  });

  test("limits product-specific coupons to matching lines", () => {
    const result = evaluateCoupon(coupon({ scope: "PRODUCTS", productIds: ["p-rice"], type: "FIXED", value: 500 }), lines, now, 0);
    expect(result.ok && result.discountMinor).toBe(500);
  });

  test("rejects coupons with no eligible items", () => {
    const result = evaluateCoupon(coupon({ scope: "PRODUCTS", productIds: ["p-other"] }), lines, now, 0);
    expect(!result.ok && result.reason).toBe("NO_ELIGIBLE_ITEMS");
  });

  test.each([
    ["INACTIVE", { isActive: false }],
    ["NOT_STARTED", { startsAt: new Date("2026-11-01T00:00:00Z") }],
    ["EXPIRED", { endsAt: new Date("2026-10-01T00:00:00Z") }],
    ["USAGE_LIMIT", { usageLimit: 5, usedCount: 5 }],
    ["MIN_ORDER", { minOrderMinor: 50_000 }],
  ] as const)("rejects with %s", (reason, overrides) => {
    const result = evaluateCoupon(coupon(overrides), lines, now, 0);
    expect(!result.ok && result.reason).toBe(reason);
  });

  test("enforces the per-customer limit", () => {
    const result = evaluateCoupon(coupon({ perCustomerLimit: 1 }), lines, now, 1);
    expect(!result.ok && result.reason).toBe("CUSTOMER_LIMIT");
  });
});

describe("computeDeliveryFee", () => {
  const zone: DeliveryZoneRule = {
    id: "z1",
    name: "East Legon",
    feeMinor: 2500,
    minOrderMinor: 5000,
    freeDeliveryThresholdMinor: 50_000,
    isActive: true,
  };

  test("charges the zone fee", () => {
    expect(computeDeliveryFee(zone, 10_000)).toEqual({ ok: true, feeMinor: 2500, freeDeliveryApplied: false });
  });

  test("applies free delivery at the threshold", () => {
    expect(computeDeliveryFee(zone, 50_000)).toEqual({ ok: true, feeMinor: 0, freeDeliveryApplied: true });
  });

  test("blocks orders below the zone minimum or for inactive zones", () => {
    expect(computeDeliveryFee(zone, 4999).ok).toBe(false);
    expect(computeDeliveryFee({ ...zone, isActive: false }, 10_000).ok).toBe(false);
  });
});

describe("computeTotals", () => {
  test("adds delivery and subtracts discount consistently", () => {
    const totals = computeTotals({ lines, discountMinor: 3180, deliveryFeeMinor: 2500 });
    expect(totals).toEqual({
      subtotalMinor: 31800,
      discountMinor: 3180,
      deliveryFeeMinor: 2500,
      taxMinor: 0,
      totalMinor: 31120,
    });
  });

  test("clamps the discount so the total can never go negative", () => {
    const totals = computeTotals({ lines, discountMinor: 999_999, deliveryFeeMinor: 0 });
    expect(totals.totalMinor).toBe(0);
  });
});

describe("bulk pricing", () => {
  const rice = { priceMinor: 48_000, salePriceMinor: null };
  const tiers = [
    { minQtyMilli: 10_000, unitPriceMinor: 40_000 },
    { minQtyMilli: 5_000, unitPriceMinor: 42_000 },
  ];

  test("charges the regular price below the first tier", () => {
    expect(unitPriceForQuantity(rice, tiers, 4_000)).toBe(48_000);
  });

  test("applies the best tier the quantity reaches", () => {
    expect(unitPriceForQuantity(rice, tiers, 5_000)).toBe(42_000);
    expect(unitPriceForQuantity(rice, tiers, 12_000)).toBe(40_000);
  });

  test("never charges more than the sale price", () => {
    const onSale = { priceMinor: 48_000, salePriceMinor: 41_000 };
    expect(unitPriceForQuantity(onSale, tiers, 5_000)).toBe(41_000);
    expect(unitPriceForQuantity(onSale, tiers, 10_000)).toBe(40_000);
  });

  test("lists only tiers that save money, smallest quantity first", () => {
    const onSale = { priceMinor: 48_000, salePriceMinor: 41_000 };
    expect(usefulTiers(onSale, tiers)).toEqual([{ minQtyMilli: 10_000, unitPriceMinor: 40_000 }]);
    expect(usefulTiers(rice, tiers)).toEqual([
      { minQtyMilli: 5_000, unitPriceMinor: 42_000 },
      { minQtyMilli: 10_000, unitPriceMinor: 40_000 },
    ]);
  });

  test("drops a larger tier that does not lower the price further", () => {
    const flat = [
      { minQtyMilli: 5_000, unitPriceMinor: 42_000 },
      { minQtyMilli: 10_000, unitPriceMinor: 43_000 },
    ];
    expect(usefulTiers(rice, flat)).toEqual([{ minQtyMilli: 5_000, unitPriceMinor: 42_000 }]);
  });
});
