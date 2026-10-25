/**
 * Money helpers. All authoritative amounts are integers in minor units
 * (pesewas for GHS). Never use floating point for financial calculations.
 */

export const DEFAULT_CURRENCY = "GHS";

const formatters = new Map<string, Intl.NumberFormat>();

function formatterFor(currency: string): Intl.NumberFormat {
  let formatter = formatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-GH", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    formatters.set(currency, formatter);
  }
  return formatter;
}

/** Formats minor units for display, e.g. 1250 => "GH₵12.50". */
export function formatMoney(minor: number, currency: string = DEFAULT_CURRENCY): string {
  assertInteger(minor, "amount");
  // Division here is for display only; the stored value stays an integer.
  return formatterFor(currency).format(minor / 100);
}

/** Plain decimal string without currency symbol, e.g. 1250 => "12.50". */
export function minorToDecimalString(minor: number): string {
  assertInteger(minor, "amount");
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100);
  const fraction = String(abs % 100).padStart(2, "0");
  return `${sign}${whole}.${fraction}`;
}

const DECIMAL_PATTERN = /^(\d{1,9})(?:\.(\d{1,2}))?$/;

/**
 * Parses a user-entered decimal amount ("12", "12.5", "12.50") into minor
 * units using string arithmetic. Returns null for invalid input.
 */
export function parseDecimalToMinor(input: string): number | null {
  const match = DECIMAL_PATTERN.exec(input.trim().replace(/,/g, ""));
  if (!match) return null;
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? "").padEnd(2, "0"));
  return whole * 100 + fraction;
}

/** Integer division by `divisor`, rounding half away from zero. */
export function divideRoundHalfUp(numerator: number, divisor: number): number {
  assertInteger(numerator, "numerator");
  assertInteger(divisor, "divisor");
  if (divisor <= 0) throw new RangeError("divisor must be positive");
  const sign = numerator < 0 ? -1 : 1;
  const abs = Math.abs(numerator);
  const quotient = Math.floor(abs / divisor);
  const remainder = abs - quotient * divisor;
  const rounded = remainder * 2 >= divisor ? quotient + 1 : quotient;
  return sign * rounded;
}

/** Applies a percentage expressed in basis points (1000 = 10%). */
export function percentageOf(amountMinor: number, basisPoints: number): number {
  return divideRoundHalfUp(amountMinor * basisPoints, 10_000);
}

export function assertInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`${label} must be a safe integer, received ${value}`);
  }
}
