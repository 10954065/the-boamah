"use client";

import Image from "next/image";
import { useEffect } from "react";
import { ImageOff, ScanBarcode } from "lucide-react";
import { formatMoney } from "@/lib/money";
import type { PricedSale, PricedTillLine } from "@/lib/pos-till";
import { formatQuantity } from "@/lib/quantity";
import { cn } from "@/lib/utils";
import { TILE_IMAGE_SIZES } from "./till-offline";

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
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-ink-muted">
        <ScanBarcode className="h-10 w-10 text-brand-300" aria-hidden="true" />
        <p className="text-base font-semibold text-ink">{ready ? "Type a product name or scan a barcode" : "Loading products"}</p>
        <p className="max-w-xs text-sm">Each product you add shows here with its photo, so you can check it against the goods.</p>
      </div>
    );
  }

  return (
    <section aria-labelledby="till-check-title">
      <h2 id="till-check-title" className="mb-1.5 px-0.5 text-xs font-semibold uppercase tracking-wider text-ink-muted">
        Check these against the goods
      </h2>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(9rem,1fr))]">
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
        "flex h-full w-full flex-col overflow-hidden rounded-lg border bg-surface text-left transition-[border-color,box-shadow] hover:border-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
        highlighted ? "border-gold-500 ring-2 ring-gold-400" : "border-line",
      )}
    >
      <span className="relative block aspect-[4/3] bg-white">
        {item.imageUrl ? (
          <Image src={item.imageUrl} alt={item.imageAlt} fill sizes={TILE_IMAGE_SIZES} className="object-contain" />
        ) : (
          <span className="flex h-full items-center justify-center text-ink-subtle">
            <ImageOff className="h-7 w-7" aria-hidden="true" />
          </span>
        )}
        <span className="absolute right-1 top-1 rounded-full bg-brand-900 px-2 py-0.5 text-xs font-bold tabular-nums text-white">{amount}</span>
      </span>
      <span className="flex flex-1 flex-col border-t border-line p-1.5">
        <span className="line-clamp-2 text-[13px] font-semibold leading-4.25 text-ink">{item.productName}</span>
        <span className="truncate text-[11px] leading-4 text-ink-muted">{item.variantName}</span>
        <span className="mt-auto pt-0.5 text-[13px] font-bold tabular-nums text-brand-800">{formatMoney(line.lineTotalMinor)}</span>
      </span>
    </button>
  );
}
