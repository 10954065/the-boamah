/**
 * The periods till reports cover: whole days in Ghana time, which is UTC all
 * year, so a day runs from midnight to midnight UTC.
 */

const DAY_MS = 86_400_000;
const MAX_DAYS = 366;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface ReportPeriod {
  /** First and last day, as YYYY-MM-DD. */
  from: string;
  to: string;
  /** Midnight starting the first day, and midnight ending the last (exclusive). */
  start: Date;
  end: Date;
  days: number;
}

export function dayString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDay(value: unknown): Date | null {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || dayString(date) !== value ? null : date;
}

/** The days asked for in the address, today when none, in order, and a year at most. */
export function reportPeriod(from: unknown, to: unknown, now: Date): ReportPeriod {
  const today = new Date(`${dayString(now)}T00:00:00.000Z`);
  const first = parseDay(from) ?? parseDay(to) ?? today;
  const last = parseDay(to) ?? first;
  const [low, high] = first <= last ? [first, last] : [last, first];
  const start = high.getTime() - low.getTime() > (MAX_DAYS - 1) * DAY_MS ? new Date(high.getTime() - (MAX_DAYS - 1) * DAY_MS) : low;
  const end = new Date(high.getTime() + DAY_MS);
  return { from: dayString(start), to: dayString(high), start, end, days: Math.round((end.getTime() - start.getTime()) / DAY_MS) };
}

export function periodPresets(now: Date): { label: string; from: string; to: string }[] {
  const today = Date.parse(`${dayString(now)}T00:00:00.000Z`);
  const daysAgo = (n: number) => dayString(new Date(today - n * DAY_MS));
  return [
    { label: "Today", from: daysAgo(0), to: daysAgo(0) },
    { label: "Yesterday", from: daysAgo(1), to: daysAgo(1) },
    { label: "Last 7 days", from: daysAgo(6), to: daysAgo(0) },
    { label: "Last 30 days", from: daysAgo(29), to: daysAgo(0) },
  ];
}
