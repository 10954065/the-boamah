import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
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
        "flex shrink-0 items-center justify-center rounded-full bg-gold-400 font-extrabold text-brand-900",
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
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-[26px] font-extrabold leading-tight tracking-tight text-ink sm:text-[30px]">{title}</h1>
        {description ? <p className="mt-1.5 max-w-3xl text-[15px] font-medium text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

interface PanelProps {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Content runs to the panel's edges, for tables. */
  flush?: boolean;
}

export function Panel({ title, description, icon: Icon, actions, children, className, flush = false }: PanelProps) {
  return (
    <section className={cn("rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)]", flush && "overflow-hidden", className)}>
      {title ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            {Icon ? (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
              </span>
            ) : null}
            <div className="min-w-0">
              <h2 className="font-display text-[16px] font-extrabold text-ink">{title}</h2>
              {description ? <p className="truncate text-[12.5px] font-medium text-ink-muted">{description}</p> : null}
            </div>
          </div>
          {actions}
        </div>
      ) : null}
      <div className={cn(!flush && "p-5")}>{children}</div>
    </section>
  );
}

type StatTone = "neutral" | "brand" | "warning" | "danger";

const STAT_TONES: Record<StatTone, { card: string; chip: string }> = {
  neutral: { card: "border-line", chip: "bg-soft text-ink-muted" },
  brand: { card: "border-brand-200 bg-brand-50", chip: "bg-brand-100 text-brand-700" },
  warning: { card: "border-gold-300 bg-gold-50", chip: "bg-gold-100 text-gold-700" },
  danger: { card: "border-danger/30 bg-danger-soft", chip: "bg-surface text-danger" },
};

export function StatCard({ label, value, hint, tone = "neutral", href, icon: Icon }: { label: string; value: string; hint?: string; tone?: StatTone; href?: string; icon?: LucideIcon }) {
  const body = (
    <div className={cn("h-full rounded-2xl border bg-surface p-5 shadow-[var(--shadow-card)] transition-[border-color,box-shadow]", STAT_TONES[tone].card, href && "hover:border-brand-400 hover:shadow-[var(--shadow-raised)]")}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-bold text-ink-muted">{label}</p>
        {Icon ? (
          <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", STAT_TONES[tone].chip)}>
            <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 text-[26px] font-extrabold leading-tight tracking-tight text-ink">{value}</p>
      {hint ? <p className="mt-1 text-[12.5px] font-medium text-ink-muted">{hint}</p> : null}
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

const PILL = "rounded-full px-2.5 font-bold";

export function OrderStatusBadge({ status, method }: { status: OrderStatusCode; method: FulfilmentMethodCode }) {
  const tone = status === "CANCELLED" ? "danger" : status === "DELIVERED" ? "success" : status === "PENDING_PAYMENT" ? "warning" : "info";
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
  return <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)]">{children}</div>;
}

export const th = "px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-ink-muted";
export const td = "px-4 py-3.5 align-middle";

export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-12 text-center text-sm font-medium text-ink-muted">
        {children}
      </td>
    </tr>
  );
}

/** GET search/filter bar — state lives in the URL. */
export function FilterBar({ action, children }: { action: string; children: ReactNode }) {
  return (
    <form action={action} method="get" className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow-card)]">
      {children}
      <button type="submit" className="h-10 rounded-lg bg-brand-700 px-5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-brand-800">
        Apply
      </button>
      <Link href={action} className="flex h-10 items-center rounded-lg px-3 text-sm font-bold text-ink-muted transition-colors hover:bg-soft hover:text-ink">
        Reset
      </Link>
    </form>
  );
}
