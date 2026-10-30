import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { POS_TENDER_LABELS, POS_TENDERS, type TenderTotals } from "@/lib/pos";
import { periodPresets, type ReportPeriod } from "@/lib/pos-report";
import { cn, formatDate } from "@/lib/utils";

/** "30 Oct 2026", or "24 Oct 2026 to 30 Oct 2026". */
export function periodLabel(period: ReportPeriod): string {
  return period.from === period.to ? formatDate(period.start) : `${formatDate(period.start)} to ${formatDate(new Date(period.end.getTime() - 1))}`;
}

export function periodQuery(period: ReportPeriod, extra: Record<string, string> = {}): string {
  return new URLSearchParams({ from: period.from, to: period.to, ...extra }).toString();
}

/** Quick periods, and any range of days, as links and a GET form: the period lives in the address. */
export function PeriodPicker({ basePath, period, now, extra = {} }: { basePath: string; period: ReportPeriod; now: Date; extra?: Record<string, string> }) {
  return (
    <div className="flex flex-wrap items-end gap-2 print:hidden">
      <nav aria-label="Period" className="flex flex-wrap rounded-md border border-line bg-surface p-0.5">
        {periodPresets(now).map((preset) => {
          const current = preset.from === period.from && preset.to === period.to;
          return (
            <Link
              key={preset.label}
              href={`${basePath}?${new URLSearchParams({ from: preset.from, to: preset.to, ...extra })}`}
              aria-current={current ? "true" : undefined}
              className={cn("rounded px-3 py-1.5 text-sm font-medium", current ? "bg-brand-700 text-white" : "text-ink-muted hover:bg-soft")}
            >
              {preset.label}
            </Link>
          );
        })}
      </nav>
      <form action={basePath} method="get" className="flex items-end gap-1.5">
        {Object.entries(extra).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <label className="text-xs font-medium text-ink-muted">
          From
          <input type="date" name="from" defaultValue={period.from} className="mt-0.5 block h-9 rounded-md border border-line-strong bg-surface px-2 text-sm text-ink" />
        </label>
        <label className="text-xs font-medium text-ink-muted">
          To
          <input type="date" name="to" defaultValue={period.to} className="mt-0.5 block h-9 rounded-md border border-line-strong bg-surface px-2 text-sm text-ink" />
        </label>
        <button type="submit" className="h-9 rounded-md bg-brand-700 px-3 text-sm font-semibold text-white hover:bg-brand-800">
          Show
        </button>
      </form>
    </div>
  );
}

/** Links that switch a list's filter, keeping the rest of the address. */
export function FilterChips<T extends string>({ basePath, filters, current, query }: { basePath: string; filters: Record<T, string>; current: T; query: Record<string, string> }) {
  return (
    <nav aria-label="Show" className="mb-4 flex flex-wrap gap-1.5 print:hidden">
      {(Object.entries(filters) as [T, string][]).map(([key, label]) => (
        <Link
          key={key}
          href={`${basePath}?${new URLSearchParams({ ...query, filter: key })}`}
          aria-current={key === current ? "true" : undefined}
          className={cn(
            "rounded-full border px-3 py-1 text-sm font-medium",
            key === current ? "border-brand-700 bg-brand-700 text-white" : "border-line-strong bg-surface text-ink-muted hover:bg-soft",
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

/** What stands out about a till sale. */
export function TillSaleBadges({ sale }: { sale: { status: string; hasShortfall: boolean; hasPriceDifference: boolean; reviewedAt: Date | null; returns: { refundMinor: number }[] } }) {
  const refunded = sale.returns.reduce((sum, r) => sum + r.refundMinor, 0);
  return (
    <span className="inline-flex flex-wrap gap-1">
      {sale.status === "VOIDED" ? <Badge tone="danger">Voided</Badge> : null}
      {sale.returns.length > 0 ? <Badge tone="gold">Refunded {formatMoney(refunded)}</Badge> : null}
      {sale.hasShortfall ? <Badge tone="warning">Short of stock</Badge> : null}
      {sale.hasPriceDifference ? <Badge tone="info">Price changed</Badge> : null}
      {sale.reviewedAt ? <Badge tone="success">Looked at</Badge> : null}
    </span>
  );
}

export function differenceText(differenceMinor: number): string {
  if (differenceMinor === 0) return "Exact";
  return `${differenceMinor > 0 ? "Over by" : "Short by"} ${formatMoney(Math.abs(differenceMinor))}`;
}

export function differenceClass(differenceMinor: number): string {
  return differenceMinor < 0 ? "text-danger" : differenceMinor > 0 ? "text-warning" : "text-success";
}

/** Each method that did not balance, or "Exact". */
export function differenceSummary(difference: TenderTotals): string {
  const off = POS_TENDERS.filter((method) => difference[method] !== 0);
  if (off.length === 0) return "Exact";
  return off.map((method) => `${POS_TENDER_LABELS[method]} ${difference[method] > 0 ? "over" : "short"} by ${formatMoney(Math.abs(difference[method]))}`).join(", ");
}
