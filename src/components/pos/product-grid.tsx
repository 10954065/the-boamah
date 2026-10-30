"use client";

import Image from "next/image";
import type { FormEvent, RefObject } from "react";
import { ImageOff, RefreshCw, ScanBarcode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { formatMoney } from "@/lib/money";
import type { PosCatalogItem } from "@/lib/pos-till";
import { effectiveUnitPrice } from "@/lib/pricing";
import { formatQuantity, UNIT_INFO } from "@/lib/quantity";
import { cn } from "@/lib/utils";
import { TILE_IMAGE_SIZES } from "./till-offline";

/** Enough to fill a large screen; searching narrows the rest down. */
export const MAX_TILES = 120;

/** As many tiles across as the frame holds, so more of the shop is in view without scrolling. */
const TILE_GRID = "grid grid-cols-2 gap-1.5 sm:grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))]";

interface ProductGridProps {
  results: readonly PosCatalogItem[];
  categories: readonly { id: string; name: string }[];
  categoryId: string | null;
  onCategory: (id: string | null) => void;
  query: string;
  onQuery: (text: string) => void;
  onSubmitSearch: () => void;
  searchRef: RefObject<HTMLInputElement | null>;
  status: "loading" | "ready" | "error";
  error: string | null;
  onRetry: () => void;
  onPick: (item: PosCatalogItem) => void;
  now: Date;
}

export function ProductGrid(props: ProductGridProps) {
  const { results, categories, categoryId, onCategory, query, onQuery, onSubmitSearch, searchRef, status, error, onRetry, onPick, now } = props;

  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmitSearch();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-1.5 border-b border-line bg-surface p-2">
        <form onSubmit={submit} role="search" className="relative">
          <ScanBarcode className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden="true" />
          <input
            ref={searchRef}
            type="search"
            autoFocus
            autoComplete="off"
            enterKeyHint="enter"
            aria-label="Search products or scan a barcode"
            placeholder="Search products or scan a barcode (F2)"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            className="h-10 w-full rounded-md border border-line-strong bg-surface pl-9 pr-3 text-base text-ink placeholder:text-ink-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
        </form>
        {/* Swiped sideways on a phone; a mouse cannot do that, so larger screens show every category. */}
        <div className="scrollbar-none -mx-2 flex gap-1 overflow-x-auto px-2 md:flex-wrap" role="group" aria-label="Categories">
          {[{ id: null, name: "All" }, ...categories].map((category) => (
            <button
              key={category.id ?? "all"}
              type="button"
              aria-pressed={categoryId === category.id}
              onClick={() => onCategory(category.id)}
              className={cn(
                "shrink-0 rounded-full border px-2.5 py-1 text-[13px] font-semibold transition-colors",
                categoryId === category.id ? "border-brand-700 bg-brand-700 text-white" : "border-line-strong bg-surface text-ink-muted hover:bg-soft hover:text-ink",
              )}
            >
              {category.name}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {status === "loading" ? (
          <div className={TILE_GRID} aria-label="Loading products">
            {Array.from({ length: 12 }, (_, index) => (
              <Skeleton key={index} className="h-20" />
            ))}
          </div>
        ) : status === "error" ? (
          <Alert tone="danger" title="The products could not be loaded">
            <p>{error}</p>
            <Button size="sm" variant="outline" className="mt-2" onClick={onRetry}>
              <RefreshCw /> Try again
            </Button>
          </Alert>
        ) : results.length === 0 ? (
          <p className="py-12 text-center text-sm text-ink-muted">{query ? `No products match "${query}".` : "No products in this category."}</p>
        ) : (
          <>
            <ul className={TILE_GRID}>
              {results.slice(0, MAX_TILES).map((item) => (
                <li key={item.variantId}>
                  <ProductTile item={item} now={now} onPick={onPick} />
                </li>
              ))}
            </ul>
            {results.length > MAX_TILES ? (
              <p className="mt-3 text-center text-sm text-ink-muted">
                Showing {MAX_TILES} of {results.length}. Search to find the rest.
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function ProductTile({ item, now, onPick }: { item: PosCatalogItem; now: Date; onPick: (item: PosCatalogItem) => void }) {
  const price = effectiveUnitPrice(item, now);
  const stockNote = item.stockMilli <= 0 ? "None in stock" : item.stockMilli <= item.lowStockMilli ? `${formatQuantity(item.stockMilli, item.unit)} left` : null;
  return (
    <button
      type="button"
      onClick={() => onPick(item)}
      className="group flex h-full w-full items-start gap-2 rounded-md border border-line bg-surface p-1.5 text-left transition-[border-color,box-shadow] hover:border-brand-300 hover:shadow-[var(--shadow-raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 active:translate-y-px"
    >
      <span className="relative block h-12 w-12 shrink-0 overflow-hidden rounded bg-soft">
        {item.imageUrl ? (
          <Image src={item.imageUrl} alt="" fill sizes={TILE_IMAGE_SIZES} className="object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center text-ink-subtle">
            <ImageOff className="h-5 w-5" aria-hidden="true" />
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-[13px] font-semibold leading-4.25 text-ink">{item.productName}</span>
        <span className="block truncate text-[11px] leading-4 text-ink-muted">{item.variantName}</span>
        {/* Fixed to one line: whatever does not fit whole wraps out of sight instead of being cut mid word. */}
        <span className="flex h-4.5 flex-wrap items-baseline gap-x-1 overflow-hidden text-[13px] leading-4.5">
          <span className="font-bold tabular-nums text-brand-800">{formatMoney(price)}</span>
          <span className="text-[11px] text-ink-muted">{UNIT_INFO[item.unit].per}</span>
          {price < item.priceMinor ? <s className="text-[11px] text-ink-subtle">{formatMoney(item.priceMinor)}</s> : null}
        </span>
        {stockNote ? <span className={cn("block truncate text-[11px] font-semibold leading-4", item.stockMilli <= 0 ? "text-warning" : "text-gold-700")}>{stockNote}</span> : null}
      </span>
    </button>
  );
}
