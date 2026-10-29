"use client";

import { useEffect, useState } from "react";
import { Minus, Plus, Scale, ScanBarcode, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { isWeighed, type PricedSale, type PricedTillLine } from "@/lib/pos-till";
import { formatQuantity, milliToDecimalString, UNIT_INFO } from "@/lib/quantity";
import { cn } from "@/lib/utils";

interface SalePanelProps {
  sale: PricedSale;
  /** The line just added or changed, scrolled into view and marked. */
  highlightId: string | null;
  onEdit: (line: PricedTillLine) => void;
  onStep: (line: PricedTillLine, direction: 1 | -1) => void;
  onRemove: (variantId: string) => void;
  onClear: () => void;
  onCharge: () => void;
  /** Shown in the phone sheet, which has its own "Current sale" title. */
  inSheet?: boolean;
}

export function SalePanel({ sale, highlightId, onEdit, onStep, onRemove, onClear, onCharge, inSheet = false }: SalePanelProps) {
  const [confirmClear, setConfirmClear] = useState(false);
  const empty = sale.lines.length === 0;

  useEffect(() => {
    if (highlightId) document.getElementById(`till-line-${highlightId}`)?.scrollIntoView({ block: "nearest" });
  }, [highlightId, sale.lines.length]);

  return (
    <section aria-label="Current sale" className={cn("flex min-h-0 flex-1 flex-col bg-surface", inSheet && "h-full")}>
      <div className={cn("flex items-center justify-between border-b border-line px-4 py-3", inSheet && "py-2")}>
        <h2 className={cn("font-display text-base font-extrabold", inSheet && "sr-only")}>Current sale</h2>
        <p className="text-sm text-ink-muted">
          {sale.lines.length} {sale.lines.length === 1 ? "item" : "items"}
        </p>
      </div>

      {empty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-ink-muted">
          <ScanBarcode className="h-10 w-10 text-brand-300" aria-hidden="true" />
          <p className="max-w-56 text-sm">Scan a barcode or tap a product to start a sale.</p>
        </div>
      ) : (
        <ol className="min-h-0 flex-1 overflow-y-auto">
          {sale.lines.map((line) => (
            <SaleLine key={line.item.variantId} line={line} highlighted={line.item.variantId === highlightId} onEdit={onEdit} onStep={onStep} onRemove={onRemove} />
          ))}
        </ol>
      )}

      <div className="space-y-3 border-t border-line bg-soft/60 px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-3">
        {sale.savingMinor > 0 ? (
          <p className="flex justify-between text-sm font-semibold text-leaf-600">
            <span>Customer saves</span>
            <span className="tabular-nums">{formatMoney(sale.savingMinor)}</span>
          </p>
        ) : null}
        <p className="flex items-baseline justify-between">
          <span className="text-sm font-semibold uppercase tracking-wider text-ink-muted">Total</span>
          <span className="font-display text-3xl font-extrabold tabular-nums text-ink">{formatMoney(sale.totalMinor)}</span>
        </p>
        <div className="flex gap-2">
          <Button
            variant={confirmClear ? "danger" : "outline"}
            size="lg"
            disabled={empty}
            onBlur={() => setConfirmClear(false)}
            onClick={() => {
              if (!confirmClear) return setConfirmClear(true);
              setConfirmClear(false);
              onClear();
            }}
          >
            {confirmClear ? "Tap again to clear" : "Clear"}
          </Button>
          <Button size="lg" className="h-14 flex-1 text-base" disabled={empty} onClick={onCharge}>
            Charge {formatMoney(sale.totalMinor)}
            <kbd className="ml-1 hidden rounded bg-white/15 px-1.5 text-xs font-medium lg:inline">F4</kbd>
          </Button>
        </div>
      </div>
    </section>
  );
}

function SaleLine({ line, highlighted, onEdit, onStep, onRemove }: { line: PricedTillLine; highlighted: boolean } & Pick<SalePanelProps, "onEdit" | "onStep" | "onRemove">) {
  const { item } = line;
  const weighed = isWeighed(item.unit);
  return (
    <li id={`till-line-${item.variantId}`} className={cn("border-b border-line px-4 py-2.5 transition-colors", highlighted && "bg-gold-50")}>
      <div className="flex gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{item.productName}</p>
          <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-ink-muted">
            <span className="truncate">{item.variantName}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">
              {formatMoney(line.unitPriceMinor)} {UNIT_INFO[item.unit].per}
            </span>
            {line.priceNote === "bulk" ? <Badge tone="info">Bulk price</Badge> : line.priceNote === "sale" ? <Badge tone="gold">On sale</Badge> : null}
          </p>
        </div>
        <p className="shrink-0 text-sm font-bold tabular-nums">{formatMoney(line.lineTotalMinor)}</p>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        {weighed ? (
          <Button variant="outline" size="sm" onClick={() => onEdit(line)} aria-label={`Change the weight of ${item.productName}`}>
            <Scale /> {formatQuantity(line.quantityMilli, item.unit)}
          </Button>
        ) : (
          <>
            <Button variant="outline" size="icon-sm" aria-label={`One less ${item.productName}`} onClick={() => onStep(line, -1)}>
              <Minus />
            </Button>
            <button
              type="button"
              onClick={() => onEdit(line)}
              aria-label={`Quantity of ${item.productName}: ${milliToDecimalString(line.quantityMilli)}. Change`}
              className="h-8 min-w-10 rounded-md border border-line-strong bg-surface px-2 text-sm font-bold tabular-nums hover:bg-soft"
            >
              {milliToDecimalString(line.quantityMilli)}
            </button>
            <Button variant="outline" size="icon-sm" aria-label={`One more ${item.productName}`} onClick={() => onStep(line, 1)}>
              <Plus />
            </Button>
          </>
        )}
        <Button variant="ghost" size="icon-sm" className="ml-auto" aria-label={`Remove ${item.productName}`} onClick={() => onRemove(item.variantId)}>
          <Trash2 />
        </Button>
      </div>
    </li>
  );
}
