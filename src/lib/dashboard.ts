/** Small calculations behind the admin dashboard, kept apart so they can be tested. */

const SHOP_TIME_ZONE = "Africa/Accra";

export interface PeriodChange {
  direction: "up" | "down" | "flat";
  /** Whole percent, or null when there was nothing in the period before to compare with. */
  percent: number | null;
}

/** How a figure moved against the same length of time just before it. */
export function periodChange(current: number, previous: number): PeriodChange {
  if (current === previous) return { direction: "flat", percent: previous === 0 ? null : 0 };
  const direction = current > previous ? "up" : "down";
  if (previous === 0) return { direction, percent: null };
  return { direction, percent: Math.round((Math.abs(current - previous) / previous) * 100) };
}

/** "Friday 30 October" in the shop's time. */
export function longDay(at: Date): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: SHOP_TIME_ZONE }).format(at);
}

/** The smallest round number (1, 2, 2.5 or 5 times a power of ten) at or above the value, so a scale ends on a clean tick. */
export function niceCeiling(value: number): number {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((multiple) => multiple * power >= value) ?? 10;
  return step * power;
}

/** Evenly spaced ticks from zero to a round top that covers the largest value. */
export function scaleTicks(largest: number, intervals = 4): number[] {
  const top = niceCeiling(largest);
  return Array.from({ length: intervals + 1 }, (_, index) => (top / intervals) * index);
}

/** Cedis for an axis: GH₵0, GH₵850, GH₵1.2K, GH₵3.4M. */
export function compactCedis(minor: number): string {
  const cedis = minor / 100;
  const format = (value: number, suffix: string) => `GH₵${Number(value.toFixed(1)).toLocaleString("en-GB")}${suffix}`;
  if (Math.abs(cedis) >= 1_000_000) return format(cedis / 1_000_000, "M");
  if (Math.abs(cedis) >= 1_000) return format(cedis / 1_000, "K");
  return format(Math.round(cedis), "");
}

/** Each part's share of the whole as whole percents that add up to 100 (largest remainder), or zeros when there is no whole. */
export function sharesOf(parts: readonly number[]): number[] {
  const total = parts.reduce((sum, part) => sum + part, 0);
  if (total <= 0) return parts.map(() => 0);
  const exact = parts.map((part) => (part / total) * 100);
  const shares = exact.map(Math.floor);
  const order = exact.map((value, index) => ({ index, remainder: value - Math.floor(value) })).toSorted((a, b) => b.remainder - a.remainder);
  let left = 100 - shares.reduce((sum, share) => sum + share, 0);
  for (let given = 0; left > 0; given += 1, left -= 1) {
    const slot = order[given % order.length]!.index;
    shares[slot] = shares[slot]! + 1;
  }
  return shares;
}
