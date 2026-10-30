"use client";

import { useEffect, useState } from "react";
import { Minus, PauseCircle, Plus, Scale, ScanBarcode, Trash2 } from "lucide-react";
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
  /** Puts the sale aside to serve someone else. */
  onHold: () => void;
  onCharge: () => void;
  /** Shown in the phone sheet, which has its own "Current sale" title. */
  inSheet?: boolean;
}

export function SalePanel({ sale, highlightId, onEdit, onStep, onRemove, onClear, onHold, onCharge, inSheet = false }: SalePanelProps) {
  const [confirmClear, setConfirmClear] = useState(false);
  const empty = sale.lines.length === 0;

  useEffect(() => {
    if (highlightId) document.getElementById(`till-line-${highlightId}`)?.scrollIntoView({ block: "nearest" });
  }, [highlightId, sale.lines.length]);

  return (
    <section aria-label="Current sale" className={cn("flex min-h-0 min-w-0 flex-1 flex-col bg-surface", inSheet && "h-full")}>
      <div className="flex items-center gap-1.5 border-b border-line px-3 py-1.5">
        <div className="min-w-0 flex-1">
          <h2 className={cn("truncate font-display text-sm font-extrabold leading-5", inSheet && "sr-only")}>Current sale</h2>
          <p className="text-xs leading-4 text-ink-muted">
            {sale.lines.length} {sale.lines.length === 1 ? "item" : "items"}
          </p>
        </div>
        <Button variant="outline" size="sm" disabled={empty} onClick={onHold} aria-label="Put this sale on hold" title="Put this sale on hold">
          <PauseCircle /> Hold
        </Button>
        <Button
          variant={confirmClear ? "danger" : "outline"}
          size="sm"
          disabled={empty}
          onBlur={() => setConfirmClear(false)}
          onClick={() => {
            if (!confirmClear) return setConfirmClear(true);
            setConfirmClear(false);
            onClear();
          }}
        >
          {confirmClear ? "Tap again" : "Clear"}
        </Button>
      </div>

      {empty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-center text-ink-muted">
          <ScanBarcode className="h-8 w-8 text-brand-300" aria-hidden="true" />
          <p className="max-w-56 text-sm">Scan a barcode or tap a product to start a sale.</p>
        </div>
      ) : (
        <ol className="min-h-0 flex-1 overflow-y-auto">
          {sale.lines.map((line) => (
            <SaleLine key={line.item.variantId} line={line} highlighted={line.item.variantId === highlightId} onEdit={onEdit} onStep={onStep} onRemove={onRemove} />
          ))}
        </ol>
      )}

      <div className="space-y-1.5 border-t border-line bg-soft/60 px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] pt-2">
        {sale.savingMinor > 0 ? (
          <p className="flex justify-between text-[13px] font-semibold text-leaf-600">
            <span>Customer saves</span>
            <span className="tabular-nums">{formatMoney(sale.savingMinor)}</span>
          </p>
        ) : null}
        <p className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Total</span>
          <span className="font-display text-2xl font-extrabold tabular-nums text-ink">{formatMoney(sale.totalMinor)}</span>
        </p>
        <Button size="lg" className="w-full px-3 text-base" disabled={empty} onClick={onCharge}>
          Charge {formatMoney(sale.totalMinor)}
          <kbd className="hidden rounded bg-white/15 px-1.5 text-xs font-medium md:inline">F4</kbd>
        </Button>
      </div>
    </section>
  );
}

function SaleLine({ line, highlighted, onEdit, onStep, onRemove }: { line: PricedTillLine; highlighted: boolean } & Pick<SalePanelProps, "onEdit" | "onStep" | "onRemove">) {
  const { item } = line;
  const weighed = isWeighed(item.unit);
  return (
    <li id={`till-line-${item.variantId}`} className={cn("border-b border-line px-3 py-1.5 transition-colors", highlighted && "bg-gold-50")}>
      <div className="flex items-baseline gap-2">
        <p className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-5">{item.productName}</p>
        <p className="shrink-0 text-[13px] font-bold leading-5 tabular-nums">{formatMoney(line.lineTotalMinor)}</p>
      </div>
      <div className="mt-0.5 flex items-center gap-1">
        <p className="flex min-w-0 flex-1 items-center gap-1 text-[11px] leading-4 text-ink-muted">
          <span className="truncate">
            {item.variantName} · <span className="tabular-nums">{formatMoney(line.unitPriceMinor)}</span> {UNIT_INFO[item.unit].per}
          </span>
          {line.priceNote === "bulk" ? <Badge tone="info">Bulk price</Badge> : line.priceNote === "sale" ? <Badge tone="gold">On sale</Badge> : null}
        </p>
        {weighed ? (
          <Button variant="outline" size="sm" className="px-2" onClick={() => onEdit(line)} aria-label={`Change the weight of ${item.productName}`}>
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
              className="h-8 min-w-8 shrink-0 rounded-md border border-line-strong bg-surface px-1.5 text-[13px] font-bold tabular-nums hover:bg-soft"
            >
              {milliToDecimalString(line.quantityMilli)}
            </button>
            <Button variant="outline" size="icon-sm" aria-label={`One more ${item.productName}`} onClick={() => onStep(line, 1)}>
              <Plus />
            </Button>
          </>
        )}
        <Button variant="ghost" size="icon-sm" aria-label={`Remove ${item.productName}`} onClick={() => onRemove(item.variantId)}>
          <Trash2 />
        </Button>
      </div>
    </li>
  );
}
