/**
 * Pure pricing engine. Every authoritative total (cart, checkout, order) is
 * produced here from database values — never from values sent by a browser.
 *
 * Policy
 * - Sale price applies when set and lower than the regular price.
 * - One coupon per order. Coupons apply on top of sale prices, only to
 *   eligible lines, and never exceed the eligible subtotal.
 * - Delivery minimum and free-delivery threshold are checked against the
 *   goods subtotal after discount.
 * - Shelf prices are tax-inclusive; taxMinor is reported separately as 0
 *   until the business configures otherwise.
 */
import { formatMoney, percentageOf } from "./money";
import { lineTotalMinor } from "./quantity";

export interface PriceSource {
  priceMinor: number;
  salePriceMinor: number | null;
}

export function effectiveUnitPrice(variant: PriceSource): number {
  if (variant.salePriceMinor !== null && variant.salePriceMinor >= 0 && variant.salePriceMinor < variant.priceMinor) {
    return variant.salePriceMinor;
  }
  return variant.priceMinor;
}

/** Whole-number discount percentage for badges, or null if not on sale. */
export function discountPercent(variant: PriceSource): number | null {
  const effective = effectiveUnitPrice(variant);
  if (effective >= variant.priceMinor || variant.priceMinor === 0) return null;
  return Math.round(((variant.priceMinor - effective) * 100) / variant.priceMinor);
}

export interface PricingLine {
  variantId: string;
  productId: string;
  categoryId: string;
  unitPriceMinor: number;
  quantityMilli: number;
}

export interface PricedLine extends PricingLine {
  lineTotalMinor: number;
}

export function priceLines(lines: readonly PricingLine[]): PricedLine[] {
  return lines.map((line) => ({ ...line, lineTotalMinor: lineTotalMinor(line.unitPriceMinor, line.quantityMilli) }));
}

export function sumLines(lines: readonly PricedLine[]): number {
  return lines.reduce((total, line) => total + line.lineTotalMinor, 0);
}

// ---------------------------------------------------------------------------
// Coupons
// ---------------------------------------------------------------------------

export interface CouponRule {
  code: string;
  type: "PERCENTAGE" | "FIXED";
  /** Basis points for PERCENTAGE, minor units for FIXED. */
  value: number;
  maxDiscountMinor: number | null;
  minOrderMinor: number;
  scope: "ALL" | "PRODUCTS" | "CATEGORIES";
  productIds: readonly string[];
  categoryIds: readonly string[];
  startsAt: Date | null;
  endsAt: Date | null;
  usageLimit: number | null;
  usedCount: number;
  perCustomerLimit: number | null;
  isActive: boolean;
}

export type CouponFailure =
  | "INACTIVE"
  | "NOT_STARTED"
  | "EXPIRED"
  | "USAGE_LIMIT"
  | "CUSTOMER_LIMIT"
  | "MIN_ORDER"
  | "NO_ELIGIBLE_ITEMS";

export type CouponResult =
  | { ok: true; discountMinor: number; eligibleSubtotalMinor: number }
  | { ok: false; reason: CouponFailure; message: string };

function isLineEligible(coupon: CouponRule, line: PricingLine): boolean {
  if (coupon.scope === "ALL") return true;
  if (coupon.scope === "PRODUCTS") return coupon.productIds.includes(line.productId);
  return coupon.categoryIds.includes(line.categoryId);
}

export function evaluateCoupon(
  coupon: CouponRule,
  lines: readonly PricedLine[],
  now: Date,
  customerRedemptions: number,
): CouponResult {
  if (!coupon.isActive) {
    return { ok: false, reason: "INACTIVE", message: "This coupon is not active." };
  }
  if (coupon.startsAt && now < coupon.startsAt) {
    return { ok: false, reason: "NOT_STARTED", message: "This coupon is not valid yet." };
  }
  if (coupon.endsAt && now > coupon.endsAt) {
    return { ok: false, reason: "EXPIRED", message: "This coupon has expired." };
  }
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
    return { ok: false, reason: "USAGE_LIMIT", message: "This coupon has reached its usage limit." };
  }
  if (coupon.perCustomerLimit !== null && customerRedemptions >= coupon.perCustomerLimit) {
    return { ok: false, reason: "CUSTOMER_LIMIT", message: "You have already used this coupon." };
  }

  const subtotal = sumLines(lines);
  if (subtotal < coupon.minOrderMinor) {
    return {
      ok: false,
      reason: "MIN_ORDER",
      message: "Your order does not yet meet this coupon's minimum amount.",
    };
  }

  const eligibleSubtotal = sumLines(lines.filter((line) => isLineEligible(coupon, line)));
  if (eligibleSubtotal <= 0) {
    return { ok: false, reason: "NO_ELIGIBLE_ITEMS", message: "This coupon does not apply to the items in your cart." };
  }

  let discount = coupon.type === "PERCENTAGE" ? percentageOf(eligibleSubtotal, coupon.value) : coupon.value;
  if (coupon.maxDiscountMinor !== null) discount = Math.min(discount, coupon.maxDiscountMinor);
  discount = Math.max(0, Math.min(discount, eligibleSubtotal));

  return { ok: true, discountMinor: discount, eligibleSubtotalMinor: eligibleSubtotal };
}

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

export interface DeliveryZoneRule {
  id: string;
  name: string;
  feeMinor: number;
  minOrderMinor: number;
  freeDeliveryThresholdMinor: number | null;
  isActive: boolean;
}

export type DeliveryResult =
  | { ok: true; feeMinor: number; freeDeliveryApplied: boolean }
  | { ok: false; message: string };

export function computeDeliveryFee(zone: DeliveryZoneRule, goodsTotalMinor: number): DeliveryResult {
  if (!zone.isActive) {
    return { ok: false, message: `We are not currently delivering to ${zone.name}.` };
  }
  if (goodsTotalMinor < zone.minOrderMinor) {
    return {
      ok: false,
      message: `Delivery to ${zone.name} needs a minimum order of ${formatMoney(zone.minOrderMinor)} (after discounts). Add a few more items or choose pickup.`,
    };
  }
  if (zone.freeDeliveryThresholdMinor !== null && goodsTotalMinor >= zone.freeDeliveryThresholdMinor) {
    return { ok: true, feeMinor: 0, freeDeliveryApplied: true };
  }
  return { ok: true, feeMinor: zone.feeMinor, freeDeliveryApplied: false };
}

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------

export interface TotalsInput {
  lines: readonly PricedLine[];
  discountMinor: number;
  deliveryFeeMinor: number;
  taxMinor?: number;
}

export interface Totals {
  subtotalMinor: number;
  discountMinor: number;
  deliveryFeeMinor: number;
  taxMinor: number;
  totalMinor: number;
}

export function computeTotals(input: TotalsInput): Totals {
  const subtotal = sumLines(input.lines);
  const discount = Math.max(0, Math.min(input.discountMinor, subtotal));
  const delivery = Math.max(0, input.deliveryFeeMinor);
  const tax = Math.max(0, input.taxMinor ?? 0);
  return {
    subtotalMinor: subtotal,
    discountMinor: discount,
    deliveryFeeMinor: delivery,
    taxMinor: tax,
    totalMinor: subtotal - discount + delivery + tax,
  };
}
