"use client";

import { useEffect } from "react";
import { ScanBarcode } from "lucide-react";
import { formatMoney } from "@/lib/money";
import type { PricedSale, PricedTillLine } from "@/lib/pos-till";
import { formatQuantity } from "@/lib/quantity";
import { cn } from "@/lib/utils";
import { CardPhoto, CARD_GRID } from "./product-grid";

interface SaleCheckProps {
  sale: PricedSale;
  /** The line just added or changed, scrolled into view and marked. */
  highlightId: string | null;
  /** The product list has loaded, so typing will find things. */
  ready: boolean;
  onEdit: (line: PricedTillLine) => void;
}

/**
 * What the till shows until the cashier looks something up: each product in
 * the sale with its photo, to check against the goods on the counter.
 */
export function SaleCheck({ sale, highlightId, ready, onEdit }: SaleCheckProps) {
  useEffect(() => {
    if (highlightId) document.getElementById(`till-check-${highlightId}`)?.scrollIntoView({ block: "nearest" });
  }, [highlightId, sale.lines.length]);

  if (sale.lines.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-line-strong p-6 text-center text-ink-muted">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <ScanBarcode className="h-8 w-8" aria-hidden="true" />
        </span>
        <p className="font-display text-lg font-extrabold text-ink">{ready ? "Type a product name or scan a barcode" : "Loading products"}</p>
        <p className="max-w-xs text-sm">Each product you add shows here with its photo, so you can check it against the goods.</p>
      </div>
    );
  }

  return (
    <section aria-labelledby="till-check-title">
      <div className="mb-2 flex items-baseline gap-1.5">
        <h2 id="till-check-title" className="text-xs font-bold uppercase tracking-wider text-ink-muted">
          Check these against the goods
        </h2>
        <span className="text-xs font-semibold text-ink-subtle">({sale.lines.length})</span>
      </div>
      <ul className={CARD_GRID}>
        {sale.lines.map((line) => (
          <li key={line.item.variantId} id={`till-check-${line.item.variantId}`}>
            <CheckCard line={line} highlighted={line.item.variantId === highlightId} onEdit={onEdit} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function CheckCard({ line, highlighted, onEdit }: { line: PricedTillLine; highlighted: boolean; onEdit: (line: PricedTillLine) => void }) {
  const { item } = line;
  const amount = formatQuantity(line.quantityMilli, item.unit);
  return (
    <button
      type="button"
      onClick={() => onEdit(line)}
      aria-label={`${item.productName}, ${amount}. Change the amount`}
      className={cn(
        "flex h-full w-full flex-col overflow-hidden rounded-xl border bg-surface text-left shadow-[var(--shadow-card)] transition-[border-color,box-shadow] hover:border-brand-300 hover:shadow-[var(--shadow-raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
        highlighted ? "border-gold-500 ring-2 ring-gold-400" : "border-line",
      )}
    >
      <CardPhoto src={item.imageUrl} alt={item.imageAlt}>
        <span className="absolute right-1.5 top-1.5 rounded-full bg-brand-900 px-2 py-0.5 text-xs font-bold tabular-nums text-white shadow-sm">{amount}</span>
      </CardPhoto>
      <span className="flex flex-1 flex-col border-t border-line p-2">
        <span className="line-clamp-2 text-[13px] font-semibold leading-4.25 text-ink">{item.productName}</span>
        <span className="truncate text-[11px] leading-4 text-ink-muted">{item.variantName}</span>
        <span className="mt-auto pt-1 text-sm font-extrabold tabular-nums text-brand-700">{formatMoney(line.lineTotalMinor)}</span>
      </span>
    </button>
  );
}
