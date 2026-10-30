import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { paymentStatusLabel, statusLabel, type FulfilmentMethodCode, type OrderStatusCode, type PaymentMethodCode, type PaymentStatusCode } from "@/lib/order-status";
import { cn } from "@/lib/utils";

/** First letters of the first and last names: "Ama Serwaa Mensah" is "AM". */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0]!, words.at(-1)!] : words;
  return letters.map((word) => word[0]!.toUpperCase()).join("") || "?";
}

export function Initials({ name, small = false, className }: { name: string; small?: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-800",
        small ? "h-8 w-8 text-[12px]" : "h-10 w-10 text-[14px]",
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

export function AdminHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[24px] font-bold leading-tight text-ink">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-[14px] text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-end gap-2">{actions}</div> : null}
    </div>
  );
}

interface PanelProps {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Content runs to the panel's edges, for tables. */
  flush?: boolean;
}

export function Panel({ title, description, actions, children, className, flush = false }: PanelProps) {
  return (
    <section className={cn("rounded-xl border border-line bg-surface", flush && "overflow-hidden", className)}>
      {title ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="text-[15px] font-bold text-ink">{title}</h2>
            {description ? <p className="text-[13px] text-ink-muted">{description}</p> : null}
          </div>
          {actions}
        </div>
      ) : null}
      <div className={cn(!flush && "p-5")}>{children}</div>
    </section>
  );
}

type StatTone = "neutral" | "brand" | "warning" | "danger";

/** The tone colours the figure only; the card itself stays plain. */
const STAT_VALUE: Record<StatTone, string> = {
  neutral: "text-ink",
  brand: "text-brand-700",
  warning: "text-warning",
  danger: "text-danger",
};

export function StatCard({ label, value, hint, tone = "neutral", href }: { label: string; value: string; hint?: string; tone?: StatTone; href?: string }) {
  const body = (
    <div className={cn("h-full rounded-xl border border-line bg-surface px-5 py-4", href && "transition-colors hover:border-brand-300 hover:bg-brand-50/40")}>
      <p className="text-[13px] font-medium text-ink-muted">{label}</p>
      <p className={cn("mt-1 text-[24px] font-bold leading-tight tabular-nums", STAT_VALUE[tone])}>{value}</p>
      {hint ? <p className="mt-1 text-[12.5px] text-ink-muted">{hint}</p> : null}
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );
}

const PILL = "rounded-full px-2.5";

/** Colour only where something needs a hand: waiting for payment, done, or stopped. Orders moving normally stay grey. */
export function OrderStatusBadge({ status, method }: { status: OrderStatusCode; method: FulfilmentMethodCode }) {
  const tone = status === "CANCELLED" ? "danger" : status === "DELIVERED" ? "success" : status === "PENDING_PAYMENT" ? "warning" : "neutral";
  return (
    <Badge tone={tone} className={PILL}>
      {statusLabel(status, method)}
    </Badge>
  );
}

export function PaymentStatusBadge({ status, method }: { status: PaymentStatusCode; method: PaymentMethodCode }) {
  const tone = status === "PAID" ? "success" : status === "FAILED" ? "danger" : status === "PENDING" ? "warning" : "neutral";
  return (
    <Badge tone={tone} className={PILL}>
      {paymentStatusLabel(status, method)}
    </Badge>
  );
}

export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto rounded-xl border border-line bg-surface">{children}</div>;
}

export const th = "px-4 py-2.5 text-left text-[12.5px] font-semibold text-ink-muted";
export const td = "px-4 py-3 align-middle";

export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-12 text-center text-sm text-ink-muted">
        {children}
      </td>
    </tr>
  );
}

/** A row of choices where one is current, such as the period on a report. */
export const segmentGroup = "flex flex-wrap rounded-lg border border-line bg-surface p-0.5";

export function segmentItem(current: boolean): string {
  return cn("rounded-md px-3 py-1.5 text-[13px] font-semibold transition-colors", current ? "bg-brand-700 text-white" : "text-ink-muted hover:bg-soft hover:text-ink");
}

/** GET search/filter bar: state lives in the URL. */
export function FilterBar({ action, children }: { action: string; children: ReactNode }) {
  return (
    <form action={action} method="get" className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-4">
      {children}
      <button type="submit" className="h-10 rounded-lg bg-brand-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-800">
        Apply
      </button>
      <Link href={action} className="flex h-10 items-center rounded-lg px-3 text-sm font-semibold text-ink-muted transition-colors hover:bg-soft hover:text-ink">
        Reset
      </Link>
    </form>
  );
}
