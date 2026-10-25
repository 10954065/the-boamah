/**
 * Quantity helpers. Quantities and stock are integer milli-units:
 * 1000 = one unit (one item, one kilogram, one bottle...). Products sold by
 * weight use steps such as 500 (0.5 kg).
 */
import { divideRoundHalfUp } from "./money";

export const MILLI = 1000;

export type SellingUnitCode =
  | "ITEM"
  | "KG"
  | "PACK"
  | "BOTTLE"
  | "BAG"
  | "BOX"
  | "BUNCH"
  | "CRATE"
  | "TIN"
  | "LOAF"
  | "LITRE"
  | "DOZEN";

interface UnitInfo {
  /** Short label used after a number: "2 kg", "3 bottles". */
  singular: string;
  plural: string;
  /** Label for "per ..." pricing. */
  per: string;
  /** Whether fractional quantities make sense for this unit. */
  divisible: boolean;
}

export const UNIT_INFO: Record<SellingUnitCode, UnitInfo> = {
  ITEM: { singular: "item", plural: "items", per: "each", divisible: false },
  KG: { singular: "kg", plural: "kg", per: "per kg", divisible: true },
  PACK: { singular: "pack", plural: "packs", per: "per pack", divisible: false },
  BOTTLE: { singular: "bottle", plural: "bottles", per: "per bottle", divisible: false },
  BAG: { singular: "bag", plural: "bags", per: "per bag", divisible: false },
  BOX: { singular: "box", plural: "boxes", per: "per box", divisible: false },
  BUNCH: { singular: "bunch", plural: "bunches", per: "per bunch", divisible: false },
  CRATE: { singular: "crate", plural: "crates", per: "per crate", divisible: false },
  TIN: { singular: "tin", plural: "tins", per: "per tin", divisible: false },
  LOAF: { singular: "loaf", plural: "loaves", per: "per loaf", divisible: false },
  LITRE: { singular: "litre", plural: "litres", per: "per litre", divisible: true },
  DOZEN: { singular: "dozen", plural: "dozen", per: "per dozen", divisible: false },
};

export const SELLING_UNITS = Object.keys(UNIT_INFO) as SellingUnitCode[];

/** 1500 => "1.5", 1000 => "1", 250 => "0.25". */
export function milliToDecimalString(milli: number): string {
  const whole = Math.trunc(milli / MILLI);
  const fraction = Math.abs(milli % MILLI);
  if (fraction === 0) return String(whole);
  const fractionText = String(fraction).padStart(3, "0").replace(/0+$/, "");
  return `${milli < 0 && whole === 0 ? "-" : ""}${whole}.${fractionText}`;
}

/** Human label: "1.5 kg", "2 bottles", "1 bunch". */
export function formatQuantity(milli: number, unit: SellingUnitCode): string {
  const info = UNIT_INFO[unit];
  const amount = milliToDecimalString(milli);
  const label = milli === MILLI ? info.singular : info.plural;
  return `${amount} ${label}`;
}

/** Parses "1.5" (units) into milli-units without floats. Null if invalid. */
export function parseDecimalToMilli(input: string): number | null {
  const match = /^(\d{1,6})(?:\.(\d{1,3}))?$/.exec(input.trim());
  if (!match) return null;
  return Number(match[1]) * MILLI + Number((match[2] ?? "").padEnd(3, "0"));
}

/** Line total in minor units: unit price × quantity, rounded half up. */
export function lineTotalMinor(unitPriceMinor: number, quantityMilli: number): number {
  return divideRoundHalfUp(unitPriceMinor * quantityMilli, MILLI);
}

export interface QuantityRules {
  stepMilli: number;
  minQtyMilli: number;
  maxQtyMilli: number | null;
}

export type QuantityCheck =
  | { ok: true }
  | { ok: false; reason: "NOT_INTEGER" | "BELOW_MIN" | "ABOVE_MAX" | "BAD_STEP" | "INSUFFICIENT_STOCK"; message: string };

/**
 * Validates a requested quantity against a variant's rules and available
 * stock. Pure function used by both server actions and UI controls.
 */
export function checkQuantity(
  quantityMilli: number,
  rules: QuantityRules,
  unit: SellingUnitCode,
  availableMilli?: number,
): QuantityCheck {
  if (!Number.isSafeInteger(quantityMilli) || quantityMilli <= 0) {
    return { ok: false, reason: "NOT_INTEGER", message: "Please choose a valid quantity." };
  }
  if (quantityMilli < rules.minQtyMilli) {
    return {
      ok: false,
      reason: "BELOW_MIN",
      message: `The minimum quantity is ${formatQuantity(rules.minQtyMilli, unit)}.`,
    };
  }
  if (rules.maxQtyMilli !== null && quantityMilli > rules.maxQtyMilli) {
    return {
      ok: false,
      reason: "ABOVE_MAX",
      message: `You can buy at most ${formatQuantity(rules.maxQtyMilli, unit)} per order.`,
    };
  }
  if (rules.stepMilli <= 0 || (quantityMilli - rules.minQtyMilli) % rules.stepMilli !== 0) {
    return {
      ok: false,
      reason: "BAD_STEP",
      message: `This product is sold in steps of ${formatQuantity(rules.stepMilli, unit)}.`,
    };
  }
  if (availableMilli !== undefined && quantityMilli > availableMilli) {
    return {
      ok: false,
      reason: "INSUFFICIENT_STOCK",
      message:
        availableMilli <= 0
          ? "This product is currently out of stock."
          : `Only ${formatQuantity(availableMilli, unit)} available.`,
    };
  }
  return { ok: true };
}

/** Largest valid quantity not exceeding `limitMilli`, or null if none. */
export function clampToValidQuantity(limitMilli: number, rules: QuantityRules): number | null {
  const cap = rules.maxQtyMilli !== null ? Math.min(limitMilli, rules.maxQtyMilli) : limitMilli;
  if (cap < rules.minQtyMilli) return null;
  const steps = Math.floor((cap - rules.minQtyMilli) / rules.stepMilli);
  return rules.minQtyMilli + steps * rules.stepMilli;
}
