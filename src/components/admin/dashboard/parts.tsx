import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, CheckCircle2, ChevronRight, PackageX } from "lucide-react";
import { sharesOf, type PeriodChange } from "@/lib/dashboard";
import { formatMoney } from "@/lib/money";
import { formatQuantity, type SellingUnitCode } from "@/lib/quantity";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Today, at a glance.
// ---------------------------------------------------------------------------

export interface TodayFigure {
  label: string;
  value: string;
}

export function TodayStrip({ figures }: { figures: readonly TodayFigure[] }) {
  return (
    <section aria-label="Today">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-brand-200 bg-brand-200 sm:grid-cols-4">
        {figures.map((figure) => (
          <div key={figure.label} className="min-w-0 bg-brand-50 px-5 py-3.5">
            <dt className="truncate text-[13px] font-medium text-brand-700">{figure.label}</dt>
            <dd className="mt-0.5 truncate text-[20px] font-bold tabular-nums text-brand-900">{figure.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Figures for the period.
// ---------------------------------------------------------------------------

/** Up is good for every figure on the dashboard, so up is green and down is red, always with an arrow and words. */
export function ChangeLine({ change, compared }: { change: PeriodChange; compared: string }) {
  if (change.percent === null) {
    const text = change.direction === "flat" ? "Nothing in this period or the one before" : `None in ${compared}`;
    return <p className="mt-2 text-[12.5px] text-ink-subtle">{text}</p>;
  }
  if (change.direction === "flat") return <p className="mt-2 text-[12.5px] text-ink-muted">Same as {compared}</p>;
  const up = change.direction === "up";
  const Arrow = up ? ArrowUpRight : ArrowDownRight;
  return (
    <p className="mt-2 text-[12.5px] text-ink-muted">
      <span className={cn("inline-flex items-center gap-0.5 font-semibold", up ? "text-success" : "text-danger")}>
        <Arrow className="h-3.5 w-3.5" aria-hidden="true" />
        {up ? "Up" : "Down"} {change.percent}%
      </span>{" "}
      on {compared}
    </p>
  );
}

/** The colour of the trend line follows what it counts: website green, till gold, as in the sales chart. */
export type TrendTone = "brand" | "gold";

const TREND_COLOURS: Record<TrendTone, string> = { brand: "text-brand-500", gold: "text-gold-500" };

/** A small trend line under a figure, no axes. */
function Sparkline({ values, tone }: { values: readonly number[]; tone: TrendTone }) {
  if (values.length < 2) return null;
  const top = Math.max(1, ...values);
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 100},${30 - (value / top) * 28}`);
  return (
    <svg aria-hidden="true" viewBox="0 0 100 32" preserveAspectRatio="none" className={cn("mt-3 h-8 w-full overflow-visible", TREND_COLOURS[tone])}>
      <polyline points={points.join(" ")} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

interface KpiTileProps {
  label: string;
  value: string;
  change?: PeriodChange;
  /** "the 30 days before", what the change is measured against. */
  compared?: string;
  hint?: string;
  trend?: readonly number[];
  trendTone?: TrendTone;
  href?: string;
}

/** One figure in the strip; the strip draws the lines between them. */
export function KpiTile({ label, value, change, compared = "the period before", hint, trend, trendTone = "brand", href }: KpiTileProps) {
  const body = (
    <>
      <p className="text-[13px] font-medium text-ink-muted">{label}</p>
      <p className="mt-1 text-[26px] font-bold leading-tight tabular-nums text-ink">{value}</p>
      {change ? <ChangeLine change={change} compared={compared} /> : null}
      {hint ? <p className="mt-2 text-[12.5px] text-ink-muted">{hint}</p> : null}
      {trend ? <div className="mt-auto"><Sparkline values={trend} tone={trendTone} /></div> : null}
    </>
  );
  const frame = "flex h-full flex-col bg-surface px-5 py-4";
  return href ? (
    <Link href={href} className={cn(frame, "transition-colors hover:bg-brand-50/50")}>
      {body}
    </Link>
  ) : (
    <div className={frame}>{body}</div>
  );
}

export function KpiStrip({ children }: { children: ReactNode }) {
  return <div className="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">{children}</div>;
}

// ---------------------------------------------------------------------------
// What needs doing.
// ---------------------------------------------------------------------------

export interface AttentionItem {
  label: string;
  detail: string;
  count: number;
  /** What a non-zero count means: something to act on soon, something wrong, or just to know. */
  tone: "warning" | "danger" | "plain";
  href: string;
}

const ATTENTION_COUNT = { warning: "text-warning", danger: "text-danger", plain: "text-ink" } as const;

export function AttentionList({ items }: { items: readonly AttentionItem[] }) {
  return (
    <ul className="-my-1 divide-y divide-line">
      {items.map(({ label, detail, count, tone, href }) => {
        const clear = count === 0;
        return (
          <li key={label}>
            <Link href={href} className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-soft">
              <span className="min-w-0 flex-1">
                <span className={cn("block text-[14px] font-semibold", clear ? "text-ink-muted" : "text-ink")}>{label}</span>
                <span className="block truncate text-[12.5px] text-ink-muted">{clear ? "Nothing waiting" : detail}</span>
              </span>
              <span className={cn("shrink-0 text-[15px] font-bold tabular-nums", clear ? "text-ink-subtle" : ATTENTION_COUNT[tone])}>{count}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-ink-subtle transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Website orders on their way through the shop.
// ---------------------------------------------------------------------------

export interface PipelineStage {
  label: string;
  detail: string;
  count: number;
  href: string;
}

/** The stages left to right, in the order an order moves through them. Sits flush in its panel. */
export function OrderPipeline({ stages, footnote }: { stages: readonly PipelineStage[]; footnote?: ReactNode }) {
  return (
    <>
      <ol className="grid grid-cols-2 gap-px bg-line lg:grid-cols-4">
        {stages.map((stage) => (
          <li key={stage.label} className="bg-surface">
            <Link href={stage.href} className="flex h-full flex-col px-5 py-4 transition-colors hover:bg-brand-50/50">
              <span className="text-[13px] font-semibold text-ink-muted">{stage.label}</span>
              <span className="mt-1 text-[28px] font-bold leading-none tabular-nums text-ink">{stage.count}</span>
              <span className="mt-2 text-[12.5px] text-ink-muted">{stage.detail}</span>
            </Link>
          </li>
        ))}
      </ol>
      {footnote ? <p className="border-t border-line px-5 py-3 text-[13px] text-ink-muted">{footnote}</p> : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Where the money came from.
// ---------------------------------------------------------------------------

export interface MoneyPart {
  label: string;
  minor: number;
  swatch: string;
}

/** Part of the whole in one bar, at most three parts, each named with its amount and share beside it. */
export function MoneyMix({ parts }: { parts: readonly MoneyPart[] }) {
  const amounts = parts.map((part) => Math.max(0, part.minor));
  const total = amounts.reduce((sum, amount) => sum + amount, 0);
  const shares = sharesOf(amounts);
  if (total === 0) return <p className="text-sm text-ink-muted">No paid sales in this period yet.</p>;
  return (
    <div>
      <p className="text-[13px] font-medium text-ink-muted">Taken in this period</p>
      <p className="mt-1 text-[26px] font-bold leading-tight tabular-nums">{formatMoney(total)}</p>
      <div className="mt-4 flex h-3 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
        {parts.map((part, index) =>
          amounts[index]! > 0 ? <span key={part.label} className={cn("h-full", part.swatch)} style={{ flexGrow: amounts[index], flexBasis: 0, minWidth: "4px" }} /> : null,
        )}
      </div>
      <ul className="mt-4 space-y-2.5">
        {parts.map((part, index) => (
          <li key={part.label} className="flex items-center gap-3 text-[14px]">
            <span aria-hidden="true" className={cn("h-2.5 w-2.5 shrink-0 rounded-sm", part.swatch)} />
            <span className="min-w-0 flex-1 text-ink-muted">{part.label}</span>
            <span className="font-semibold tabular-nums text-ink">{formatMoney(amounts[index]!)}</span>
            <span className="w-10 text-right text-[12.5px] tabular-nums text-ink-subtle">{shares[index]}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Best sellers and low stock.
// ---------------------------------------------------------------------------

export function BestSellers({ items }: { items: readonly { productId: string; name: string; revenueMinor: number }[] }) {
  if (items.length === 0) return <p className="text-sm text-ink-muted">No completed sales in this period yet.</p>;
  const top = Math.max(1, ...items.map((item) => item.revenueMinor));
  return (
    <ol className="space-y-3.5">
      {items.map((item, index) => (
        <li key={item.productId}>
          <div className="flex items-baseline gap-3 text-[14px]">
            <span className="w-4 shrink-0 text-[13px] tabular-nums text-ink-subtle">{index + 1}</span>
            <Link href={`/admin/products/${item.productId}`} className="min-w-0 flex-1 truncate font-medium text-ink hover:text-brand-700 hover:underline">
              {item.name}
            </Link>
            <span className="shrink-0 font-semibold tabular-nums text-ink">{formatMoney(item.revenueMinor)}</span>
          </div>
          <div className="ml-7 mt-1.5 h-1.5">
            <div className="h-full rounded-r-sm bg-brand-500" style={{ width: `${Math.max(2, (item.revenueMinor / top) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

export interface LowStockItem {
  id: string;
  productId: string;
  productName: string;
  variantName: string;
  stockMilli: number;
  lowStockMilli: number;
  unit: string;
}

/** How far each option has fallen towards nothing, against its alert level. */
export function LowStockList({ items }: { items: readonly LowStockItem[] }) {
  if (items.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-success">
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Every product is above its alert level.
      </p>
    );
  }
  return (
    <ul className="space-y-3.5">
      {items.map((item) => {
        const unit = item.unit as SellingUnitCode;
        const empty = item.stockMilli <= 0;
        const fill = empty ? 0 : Math.min(100, (item.stockMilli / Math.max(1, item.lowStockMilli)) * 100);
        return (
          <li key={item.id}>
            <div className="flex items-baseline justify-between gap-3 text-[14px]">
              <Link href={`/admin/products/${item.productId}`} className="min-w-0 truncate font-medium text-ink hover:text-brand-700 hover:underline">
                {item.productName} <span className="text-ink-subtle">· {item.variantName}</span>
              </Link>
              {empty ? (
                <span className="flex shrink-0 items-center gap-1 text-[13px] font-semibold text-danger">
                  <PackageX className="h-4 w-4" aria-hidden="true" /> Out of stock
                </span>
              ) : (
                <span className="shrink-0 text-[13px] font-semibold text-warning">{formatQuantity(item.stockMilli, unit)} left</span>
              )}
            </div>
            <div className={cn("mt-1.5 h-1.5 overflow-hidden rounded-full", empty ? "bg-danger-soft" : "bg-gold-100")} aria-hidden="true">
              <div className="h-full rounded-full bg-gold-500" style={{ width: `${fill}%` }} />
            </div>
            <p className="mt-1 text-[12px] text-ink-subtle">Alert at {formatQuantity(item.lowStockMilli, unit)}</p>
          </li>
        );
      })}
    </ul>
  );
}
