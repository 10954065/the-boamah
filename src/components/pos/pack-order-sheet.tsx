"use client";

import Image from "next/image";
import { useTransition } from "react";
import { Check, Globe, ImageOff, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, SheetContent } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/feedback";
import { Checkbox } from "@/components/ui/input";
import { statusLabel } from "@/lib/order-status";
import { orderSteps, packAction, paymentNote, type TillOrder, type TillOrderLine } from "@/lib/pos-orders";
import { formatQuantity } from "@/lib/quantity";
import { cn } from "@/lib/utils";
import { PackingSlip } from "./packing-slip";
import { PrintArea } from "./receipt";
import { TILE_IMAGE_SIZES } from "./till-offline";
import type { TillPrefs } from "./till-storage";
import type { WebsiteOrders } from "./use-website-orders";

/** Marks anything bought on the website, so it is never taken for a till sale. */
export function WebsiteTag() {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-brand-700 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
      <Globe className="h-3 w-3" aria-hidden="true" /> Website
    </span>
  );
}

interface PackOrderSheetProps {
  order: TillOrder | null;
  queue: WebsiteOrders;
  paper: TillPrefs["paper"];
  onClose: () => void;
}

export function PackOrderSheet({ order, queue, paper, onClose }: PackOrderSheetProps) {
  return (
    <Dialog open={order !== null} onOpenChange={(open) => !open && onClose()}>
      {order ? <PackOrder order={order} queue={queue} paper={paper} /> : null}
    </Dialog>
  );
}

/** Where the order is going, in the words a rider or packer would use. */
function destination(order: TillOrder): string[] {
  if (order.fulfilmentMethod === "PICKUP") return ["Customer collects at the shop"];
  const place = [order.area, order.city].filter(Boolean).join(", ");
  return [order.addressLine, order.addressDetails, place, order.zoneName ? `Zone: ${order.zoneName}` : null].filter((line): line is string => Boolean(line));
}

function PickLine({ line, done, locked, onToggle }: { line: TillOrderLine; done: boolean; locked: boolean; onToggle: () => void }) {
  return (
    <li>
      <label className={cn("flex items-center gap-2 rounded-md border p-1.5 transition-colors", done ? "border-brand-300 bg-brand-50" : "border-line", locked ? "cursor-default" : "cursor-pointer")}>
        <Checkbox checked={done} disabled={locked} onChange={onToggle} className="h-5 w-5" aria-label={`Packed ${line.productName}`} />
        <span className="relative block h-12 w-12 shrink-0 overflow-hidden rounded bg-white">
          {line.imageUrl ? (
            <Image src={line.imageUrl} alt="" fill sizes={TILE_IMAGE_SIZES} className="object-contain" />
          ) : (
            <span className="flex h-full items-center justify-center text-ink-subtle">
              <ImageOff className="h-5 w-5" aria-hidden="true" />
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-sm font-semibold leading-4.5">{line.productName}</span>
          <span className="block truncate text-xs text-ink-muted">
            {line.variantName} · {line.sku}
          </span>
        </span>
        <span className="shrink-0 font-display text-sm font-extrabold tabular-nums">{formatQuantity(line.quantityMilli, line.unit)}</span>
      </label>
    </li>
  );
}

function OrderSteps({ order }: { order: TillOrder }) {
  return (
    <ol aria-label="Order progress" className="flex items-start">
      {orderSteps(order).map((step, index) => (
        <li key={step.label} aria-current={step.state === "now" ? "step" : undefined} className="relative flex min-w-0 flex-1 flex-col items-center gap-1 text-center">
          {index > 0 ? <span aria-hidden="true" className={cn("absolute right-1/2 top-2.5 h-0.5 w-full -translate-x-2.5", step.state === "next" ? "bg-line-strong" : "bg-brand-500")} /> : null}
          <span
            className={cn(
              "relative flex h-5 w-5 items-center justify-center rounded-full border-2 text-[10px] font-bold",
              step.state === "done" && "border-brand-500 bg-brand-500 text-white",
              step.state === "now" && "border-brand-500 bg-surface text-brand-600 ring-4 ring-brand-500/20",
              step.state === "next" && "border-line-strong bg-surface text-ink-subtle",
            )}
          >
            {step.state === "done" ? <Check className="h-3 w-3" aria-hidden="true" /> : index + 1}
          </span>
          <span className={cn("text-[11px] leading-tight", step.state === "next" ? "text-ink-subtle" : "font-semibold text-ink")}>{step.label}</span>
        </li>
      ))}
    </ol>
  );
}

/** The attendant's pick list: who it is for, where it goes, and each item to tick off into the bag. */
function PackOrder({ order, queue, paper }: Omit<PackOrderSheetProps, "order" | "onClose"> & { order: TillOrder }) {
  const [pending, startTransition] = useTransition();
  const action = packAction(order.status, order.fulfilmentMethod);
  const ready = order.status === "READY" || order.status === "OUT_FOR_DELIVERY";
  const ticked = queue.ticked[order.id] ?? [];
  const tickedCount = order.lines.filter((line) => ticked.includes(line.id)).length;
  const needsTicks = order.status === "PROCESSING" && tickedCount < order.lines.length;

  const footer = (
    <div className="space-y-2">
      {needsTicks ? <p className="text-center text-xs text-ink-muted">Tick every item to finish packing.</p> : null}
      {action ? (
        <Button size="lg" className="w-full" disabled={pending || needsTicks} onClick={() => startTransition(async () => void (await queue.move(order.id, action.to)))}>
          {pending ? <Spinner label="Saving" /> : null} {action.label}
        </Button>
      ) : null}
      <Button variant="outline" className="w-full" onClick={() => window.print()}>
        <Printer /> Print packing slip
      </Button>
    </div>
  );

  return (
    <SheetContent side="right" title={`Website order ${order.reference}`} closeLabel="Back to website orders" className="max-w-md" footer={footer}>
      <div className="space-y-3 p-4">
        <p className="flex items-center justify-between gap-2">
          <WebsiteTag />
          <span className="text-xs font-semibold text-ink-muted">{statusLabel(order.status, order.fulfilmentMethod)}</span>
        </p>

        <OrderSteps order={order} />

        <div className="rounded-md bg-soft px-3 py-2 text-sm">
          <p className="font-semibold">{order.customerName}</p>
          <p className="tabular-nums">{order.phone}</p>
          {destination(order).map((line) => (
            <p key={line} className="text-ink-muted">
              {line}
            </p>
          ))}
          {order.deliveryInstructions ? <p className="mt-1 text-ink">Note: {order.deliveryInstructions}</p> : null}
        </div>

        <p className={cn("text-sm font-semibold", order.paymentStatus === "PAID" ? "text-leaf-600" : "text-gold-700")}>{paymentNote(order)}</p>

        <div>
          <h3 className="mb-1.5 flex justify-between text-xs font-semibold uppercase tracking-wider text-ink-muted">
            <span>Items to pack</span>
            <span className="tabular-nums">{ready ? order.lines.length : tickedCount} of {order.lines.length}</span>
          </h3>
          <ul className="space-y-1.5">
            {order.lines.map((line) => (
              <PickLine key={line.id} line={line} done={ready || ticked.includes(line.id)} locked={ready} onToggle={() => queue.toggleTick(order.id, line.id)} />
            ))}
          </ul>
        </div>
      </div>
      <PrintArea>
        <PackingSlip order={order} paper={paper} />
      </PrintArea>
    </SheetContent>
  );
}
