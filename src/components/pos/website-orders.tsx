"use client";

import { useState } from "react";
import { Globe, WifiOff } from "lucide-react";
import { Alert } from "@/components/ui/feedback";
import { orderAge, PACK_STAGES, packStage, paymentNote, type PackStage, type TillOrder } from "@/lib/pos-orders";
import { cn } from "@/lib/utils";
import { PackOrderSheet, WebsiteTag } from "./pack-order-sheet";
import { useMinuteClock, useOnline } from "./till-header";
import type { TillPrefs } from "./till-storage";
import type { WebsiteOrders } from "./use-website-orders";

interface WebsiteOrdersButtonProps {
  waiting: number;
  active: boolean;
  onClick: () => void;
}

/** Beside the search box: how many website orders need packing, and the way to them. */
export function WebsiteOrdersButton({ waiting, active, onClick }: WebsiteOrdersButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={`Website orders, ${waiting} waiting`}
      title="Website orders"
      onClick={onClick}
      className={cn(
        "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[13px] font-semibold transition-colors",
        active ? "border-brand-700 bg-brand-700 text-white" : waiting > 0 ? "border-gold-500 bg-gold-100 text-brand-900" : "border-line-strong bg-surface text-ink-muted hover:bg-soft hover:text-ink",
      )}
    >
      <Globe className="h-4 w-4" aria-hidden="true" />
      <span className="hidden sm:inline">Website orders</span>
      {waiting > 0 ? <span className="rounded-full bg-brand-900 px-1.5 text-[11px] font-bold leading-4 text-white">{waiting}</span> : null}
    </button>
  );
}

function OrderCard({ order, minute, onOpen }: { order: TillOrder; minute: number; onOpen: () => void }) {
  const productCount = order.lines.length;
  const paid = order.paymentStatus === "PAID";
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Website order ${order.reference} for ${order.customerName}. ${paymentNote(order)}`}
      className="w-full rounded-lg border border-line bg-surface p-2 text-left transition-[border-color,box-shadow] hover:border-brand-300 hover:shadow-[var(--shadow-raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      <span className="flex items-center justify-between gap-2">
        <WebsiteTag />
        <span className="text-[11px] text-ink-muted">{orderAge(order.placedAt, minute * 60_000)}</span>
      </span>
      <span className="mt-1 block truncate font-display text-sm font-extrabold tabular-nums">{order.reference}</span>
      <span className="block truncate text-[13px] font-semibold">{order.customerName}</span>
      <span className="block truncate text-xs text-ink-muted">
        {order.fulfilmentMethod === "PICKUP" ? "Pickup at the shop" : `Delivery to ${order.area || order.city || "customer"}`} · {productCount} {productCount === 1 ? "product" : "products"}
      </span>
      <span className={cn("block truncate text-xs font-semibold", paid ? "text-leaf-600" : "text-gold-700")}>{paymentNote(order)}</span>
    </button>
  );
}

function Column({ stage, title, orders, minute, onOpen }: { stage: PackStage; title: string; orders: TillOrder[]; minute: number; onOpen: (id: string) => void }) {
  const titleId = `till-orders-${stage}`;
  return (
    <section aria-labelledby={titleId} className="min-w-0">
      <h2 id={titleId} className="mb-1.5 flex items-center gap-1.5 px-0.5 text-xs font-semibold uppercase tracking-wider text-ink-muted">
        {title} <span className="rounded-full bg-line px-1.5 text-[11px] font-bold leading-4 text-ink">{orders.length}</span>
      </h2>
      {orders.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line-strong px-2 py-3 text-center text-xs text-ink-muted">Nothing here</p>
      ) : (
        <ul className="space-y-1.5">
          {orders.map((order) => (
            <li key={order.id}>
              <OrderCard order={order} minute={minute} onOpen={() => onOpen(order.id)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Orders placed on the website, in the order they came in, from packing to handing over. */
export function WebsiteOrdersBoard({ queue, paper }: { queue: WebsiteOrders; paper: TillPrefs["paper"] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const minute = useMinuteClock();
  const online = useOnline();
  const open = queue.orders.find((order) => order.id === openId) ?? null;

  if (queue.loaded && queue.orders.length === 0 && !queue.error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-ink-muted">
        <Globe className="h-10 w-10 text-brand-300" aria-hidden="true" />
        <p className="text-base font-semibold text-ink">No website orders waiting</p>
        <p className="max-w-xs text-sm">New orders from the website show here by themselves.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {!online ? (
        <p role="status" className="flex items-center gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
          <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" /> Website orders need the internet. This list updates once the connection is back.
        </p>
      ) : queue.error ? (
        <Alert tone="danger" title="The website orders could not be refreshed">
          <p>{queue.error}</p>
        </Alert>
      ) : null}
      {!queue.loaded && !queue.error ? <p className="py-12 text-center text-sm text-ink-muted">Loading website orders</p> : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {PACK_STAGES.map(({ stage, title }) => (
          <Column key={stage} stage={stage} title={title} orders={queue.orders.filter((order) => packStage(order.status) === stage)} minute={minute} onOpen={setOpenId} />
        ))}
      </div>
      <PackOrderSheet order={open} queue={queue} paper={paper} onClose={() => setOpenId(null)} />
    </div>
  );
}
