import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { paymentStatusLabel, statusLabel, type FulfilmentMethodCode, type OrderStatusCode, type PaymentMethodCode, type PaymentStatusCode } from "@/lib/order-status";
import { cn } from "@/lib/utils";

export function AdminHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-extrabold">{title}</h1>
        {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Panel({ title, actions, children, className }: { title?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-lg border border-line bg-surface", className)}>
      {title ? (
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 className="text-[15px] font-bold">{title}</h2>
          {actions}
        </div>
      ) : null}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function StatCard({ label, value, hint, tone = "neutral", href }: { label: string; value: string; hint?: string; tone?: "neutral" | "brand" | "warning" | "danger"; href?: string }) {
  const body = (
    <div
      className={cn(
        "h-full rounded-lg border bg-surface p-4 transition-colors",
        tone === "brand" && "border-brand-200 bg-brand-50",
        tone === "warning" && "border-gold-300 bg-gold-50",
        tone === "danger" && "border-danger/30 bg-danger-soft",
        tone === "neutral" && "border-line",
        href && "hover:border-brand-400",
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">{label}</p>
      <p className="mt-2 font-display text-2xl font-extrabold tabular-nums text-ink">{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink-muted">{hint}</p> : null}
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

export function OrderStatusBadge({ status, method }: { status: OrderStatusCode; method: FulfilmentMethodCode }) {
  const tone = status === "CANCELLED" ? "danger" : status === "DELIVERED" ? "success" : status === "PENDING_PAYMENT" ? "warning" : "info";
  return <Badge tone={tone}>{statusLabel(status, method)}</Badge>;
}

export function PaymentStatusBadge({ status, method }: { status: PaymentStatusCode; method: PaymentMethodCode }) {
  const tone = status === "PAID" ? "success" : status === "FAILED" ? "danger" : status === "PENDING" ? "warning" : "neutral";
  return <Badge tone={tone}>{paymentStatusLabel(status, method)}</Badge>;
}

export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto rounded-lg border border-line bg-surface">{children}</div>;
}

export const th = "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-subtle";
export const td = "px-4 py-3 align-middle";

export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-ink-muted">
        {children}
      </td>
    </tr>
  );
}

/** GET search/filter bar — state lives in the URL. */
export function FilterBar({ action, children }: { action: string; children: ReactNode }) {
  return (
    <form action={action} method="get" className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-line bg-surface p-3">
      {children}
      <button type="submit" className="h-10 rounded-md bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800">
        Apply
      </button>
      <Link href={action} className="flex h-10 items-center rounded-md px-3 text-sm font-medium text-ink-muted hover:bg-soft">
        Reset
      </Link>
    </form>
  );
}
