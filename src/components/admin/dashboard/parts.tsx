import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, CheckCircle2, ChevronRight, Minus, PackageX, type LucideIcon } from "lucide-react";
import { sharesOf, type PeriodChange } from "@/lib/dashboard";
import { formatMoney } from "@/lib/money";
import { formatQuantity, type SellingUnitCode } from "@/lib/quantity";
import { cn } from "@/lib/utils";

export type Accent = "brand" | "info" | "gold" | "leaf";

const ACCENTS: Record<Accent, { chip: string; bar: string; line: string }> = {
  brand: { chip: "bg-brand-50 text-brand-700", bar: "bg-brand-500", line: "text-brand-500" },
  info: { chip: "bg-info-soft text-info", bar: "bg-info", line: "text-info" },
  gold: { chip: "bg-gold-100 text-gold-700", bar: "bg-gold-500", line: "text-gold-500" },
  leaf: { chip: "bg-leaf-50 text-leaf-600", bar: "bg-leaf-500", line: "text-leaf-500" },
};

// ---------------------------------------------------------------------------
// The welcome band.
// ---------------------------------------------------------------------------

export interface TodayFigure {
  label: string;
  value: string;
}

export function DashboardHero({ greeting, day, today }: { greeting: string; day: string; today: readonly TodayFigure[] }) {
  return (
    <section aria-labelledby="dashboard-title" className="relative isolate overflow-hidden rounded-3xl bg-brand-900 px-6 py-7 text-white shadow-[var(--shadow-raised)] sm:px-8 sm:py-8">
      <span aria-hidden="true" className="absolute -right-20 -top-28 -z-10 h-80 w-80 rounded-full bg-leaf-400/25 blur-3xl" />
      <span aria-hidden="true" className="absolute -bottom-32 left-1/3 -z-10 h-72 w-72 rounded-full bg-gold-400/20 blur-3xl" />
      <span aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(rgb(255_255_255/0.07)_1px,transparent_1px)] [background-size:18px_18px]" />
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0">
          <h1 id="dashboard-title" className="text-[12px] font-bold uppercase tracking-[0.22em] text-gold-300">
            Dashboard
          </h1>
          <p className="mt-2 font-display text-[28px] font-extrabold leading-tight tracking-tight sm:text-[34px]">{greeting}</p>
          <p className="mt-1.5 text-[15px] font-medium text-brand-100">{day} · here is how the shop is doing</p>
        </div>
        <dl className="grid w-full grid-cols-2 gap-2.5 sm:w-auto sm:grid-cols-4">
          {today.map((figure) => (
            <div key={figure.label} className="min-w-0 rounded-2xl bg-white/[0.07] px-4 py-3 ring-1 ring-white/10 backdrop-blur-sm sm:min-w-32">
              <dt className="truncate text-[12px] font-semibold text-brand-200">{figure.label}</dt>
              <dd className="mt-0.5 truncate text-[17px] font-extrabold sm:text-xl">{figure.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Figure cards.
// ---------------------------------------------------------------------------

/** Up is good for every figure on the dashboard, so up is green and down is red, always with an arrow and words. */
export function ChangeBadge({ change }: { change: PeriodChange }) {
  if (change.direction === "flat") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-soft px-2 py-0.5 font-bold text-ink-muted">
        <Minus className="h-3.5 w-3.5" aria-hidden="true" /> {change.percent === null ? "None yet" : "No change"}
      </span>
    );
  }
  const up = change.direction === "up";
  const Arrow = up ? ArrowUpRight : ArrowDownRight;
  const text = change.percent === null ? (up ? "New" : "Down") : `${up ? "Up" : "Down"} ${change.percent}%`;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold", up ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>
      <Arrow className="h-3.5 w-3.5" aria-hidden="true" /> {text}
    </span>
  );
}

/** A small trend line under a figure: the period in the card's colour, no axes. */
function Sparkline({ values, accent }: { values: readonly number[]; accent: Accent }) {
  if (values.length < 2) return null;
  const top = Math.max(1, ...values);
  const heightOf = (value: number) => 30 - (value / top) * 28;
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 100},${heightOf(value)}`);
  return (
    <div aria-hidden="true" className={cn("relative mt-4 h-10", ACCENTS[accent].line)}>
      <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="h-full w-full overflow-visible">
        <polygon points={`0,32 ${points.join(" ")} 100,32`} fill="currentColor" opacity="0.1" />
        <polyline points={points.join(" ")} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {/* The end dot sits outside the stretched drawing so it stays round. */}
      <span
        className="absolute right-0 h-2.5 w-2.5 -translate-y-1/2 translate-x-1/2 rounded-full bg-current ring-2 ring-surface"
        style={{ top: `${(heightOf(values.at(-1)!) / 32) * 100}%` }}
      />
    </div>
  );
}

interface KpiTileProps {
  label: string;
  value: string;
  icon: LucideIcon;
  accent: Accent;
  change?: PeriodChange;
  compared?: string;
  hint?: string;
  trend?: readonly number[];
  href?: string;
}

export function KpiTile({ label, value, icon: Icon, accent, change, compared, hint, trend, href }: KpiTileProps) {
  const body = (
    <>
      <span aria-hidden="true" className={cn("absolute inset-x-0 top-0 h-1", ACCENTS[accent].bar)} />
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-bold text-ink-muted">{label}</p>
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", ACCENTS[accent].chip)}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-1 text-[30px] font-extrabold leading-none tracking-tight text-ink">{value}</p>
      {change ? (
        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px]">
          <ChangeBadge change={change} />
          {compared ? <span className="font-medium text-ink-subtle">{compared}</span> : null}
        </p>
      ) : null}
      {hint ? <p className="mt-2 text-[12.5px] font-medium text-ink-muted">{hint}</p> : null}
      {trend ? <Sparkline values={trend} accent={accent} /> : null}
    </>
  );
  const frame =
    "relative flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface p-5 pt-6 shadow-[var(--shadow-card)] transition-[transform,box-shadow,border-color] duration-200";
  return href ? (
    <Link href={href} className={cn(frame, "hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-[var(--shadow-raised)] motion-reduce:hover:translate-y-0")}>
      {body}
    </Link>
  ) : (
    <div className={frame}>{body}</div>
  );
}

// ---------------------------------------------------------------------------
// What needs doing.
// ---------------------------------------------------------------------------

export interface AttentionItem {
  label: string;
  detail: string;
  count: number;
  /** What a non-zero count means. */
  tone: "warning" | "danger" | "info";
  icon: LucideIcon;
  href: string;
}

const ATTENTION_TONES = {
  warning: { chip: "bg-gold-100 text-gold-700", pill: "bg-warning-soft text-warning" },
  danger: { chip: "bg-danger-soft text-danger", pill: "bg-danger-soft text-danger" },
  info: { chip: "bg-info-soft text-info", pill: "bg-info-soft text-info" },
} as const;

export function AttentionList({ items }: { items: readonly AttentionItem[] }) {
  return (
    <ul className="-my-2 divide-y divide-line">
      {items.map(({ label, detail, count, tone, icon: Icon, href }) => {
        const clear = count === 0;
        return (
          <li key={label}>
            <Link href={href} className="group -mx-2 flex items-center gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-soft">
              <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", clear ? "bg-success-soft text-success" : ATTENTION_TONES[tone].chip)}>
                {clear ? <CheckCircle2 className="h-5 w-5" aria-hidden="true" /> : <Icon className="h-5 w-5" aria-hidden="true" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-bold text-ink">{label}</span>
                <span className="block truncate text-[12.5px] font-medium text-ink-muted">{clear ? "All clear" : detail}</span>
              </span>
              <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[13px] font-extrabold tabular-nums", clear ? "bg-soft text-ink-subtle" : ATTENTION_TONES[tone].pill)}>
                {count}
              </span>
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

/** Light to dark green: the stages are in order, so the colour steps with them. */
const STAGE_BARS = ["bg-brand-200", "bg-brand-300", "bg-brand-400", "bg-brand-600"];

export function OrderPipeline({ stages, footnote }: { stages: readonly PipelineStage[]; footnote?: ReactNode }) {
  return (
    <>
      <ol className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stages.map((stage, index) => (
          <li key={stage.label}>
            <Link
              href={stage.href}
              className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-canvas p-4 transition-[border-color,background-color] hover:border-brand-300 hover:bg-brand-50/60"
            >
              <span aria-hidden="true" className={cn("absolute inset-x-0 top-0 h-1", STAGE_BARS[index])} />
              <span className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-ink-muted">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-surface text-[11px] text-ink ring-1 ring-line-strong">{index + 1}</span>
                {stage.label}
              </span>
              <span className="mt-2 text-[32px] font-extrabold leading-none text-ink">{stage.count}</span>
              <span className="mt-1.5 text-[12.5px] font-medium text-ink-muted">{stage.detail}</span>
            </Link>
          </li>
        ))}
      </ol>
      {footnote ? <p className="mt-4 text-[13px] font-medium text-ink-muted">{footnote}</p> : null}
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
  if (total === 0) return <p className="text-sm font-medium text-ink-muted">No paid sales in this period yet.</p>;
  return (
    <div>
      <p className="text-[13px] font-bold text-ink-muted">Taken in this period</p>
      <p className="mt-1 text-[30px] font-extrabold leading-none tracking-tight">{formatMoney(total)}</p>
      <div className="mt-5 flex h-4 gap-[2px] overflow-hidden rounded-full" aria-hidden="true">
        {parts.map((part, index) =>
          amounts[index]! > 0 ? <span key={part.label} className={cn("h-full first:rounded-l-full last:rounded-r-full", part.swatch)} style={{ flexGrow: amounts[index], flexBasis: 0, minWidth: "4px" }} /> : null,
        )}
      </div>
      <ul className="mt-5 space-y-3">
        {parts.map((part, index) => (
          <li key={part.label} className="flex items-center gap-3 text-[14px]">
            <span aria-hidden="true" className={cn("h-3 w-3 shrink-0 rounded-[3px]", part.swatch)} />
            <span className="min-w-0 flex-1 font-semibold text-ink-muted">{part.label}</span>
            <span className="font-extrabold tabular-nums text-ink">{formatMoney(amounts[index]!)}</span>
            <span className="w-11 text-right text-[12.5px] font-bold tabular-nums text-ink-subtle">{shares[index]}%</span>
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
  if (items.length === 0) return <p className="text-sm font-medium text-ink-muted">No completed sales in this period yet.</p>;
  const top = Math.max(1, ...items.map((item) => item.revenueMinor));
  return (
    <ol className="space-y-4">
      {items.map((item, index) => (
        <li key={item.productId}>
          <div className="flex items-baseline gap-3 text-[14px]">
            <span className="w-5 shrink-0 text-[13px] font-extrabold text-ink-subtle">{index + 1}</span>
            <Link href={`/admin/products/${item.productId}`} className="min-w-0 flex-1 truncate font-bold text-ink hover:text-brand-700">
              {item.name}
            </Link>
            <span className="shrink-0 font-extrabold tabular-nums text-ink">{formatMoney(item.revenueMinor)}</span>
          </div>
          <div className="ml-8 mt-1.5 h-2">
            <div className="h-full rounded-r-[4px] bg-brand-500" style={{ width: `${Math.max(2, (item.revenueMinor / top) * 100)}%` }} />
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
      <p className="flex items-center gap-2 text-sm font-semibold text-success">
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Every product is above its alert level.
      </p>
    );
  }
  return (
    <ul className="space-y-4">
      {items.map((item) => {
        const unit = item.unit as SellingUnitCode;
        const empty = item.stockMilli <= 0;
        const fill = empty ? 0 : Math.min(100, (item.stockMilli / Math.max(1, item.lowStockMilli)) * 100);
        return (
          <li key={item.id}>
            <div className="flex items-baseline justify-between gap-3 text-[14px]">
              <Link href={`/admin/products/${item.productId}`} className="min-w-0 truncate font-bold text-ink hover:text-brand-700">
                {item.productName} <span className="font-medium text-ink-subtle">· {item.variantName}</span>
              </Link>
              {empty ? (
                <span className="flex shrink-0 items-center gap-1 text-[13px] font-extrabold text-danger">
                  <PackageX className="h-4 w-4" aria-hidden="true" /> Out of stock
                </span>
              ) : (
                <span className="shrink-0 text-[13px] font-extrabold text-warning">{formatQuantity(item.stockMilli, unit)} left</span>
              )}
            </div>
            <div className={cn("mt-1.5 h-2 overflow-hidden rounded-full", empty ? "bg-danger-soft" : "bg-gold-100")} aria-hidden="true">
              <div className="h-full rounded-full bg-gold-500" style={{ width: `${fill}%` }} />
            </div>
            <p className="mt-1 text-[12px] font-medium text-ink-subtle">Alert at {formatQuantity(item.lowStockMilli, unit)}</p>
          </li>
        );
      })}
    </ul>
  );
}
