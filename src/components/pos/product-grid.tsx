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
      <div className="space-y-2 border-b border-line bg-surface p-3">
        <form onSubmit={submit} role="search" className="relative">
          <ScanBarcode className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-subtle" aria-hidden="true" />
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
            className="h-12 w-full rounded-lg border border-line-strong bg-surface pl-11 pr-3 text-base text-ink placeholder:text-ink-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
        </form>
        <div className="scrollbar-none -mx-3 flex gap-1.5 overflow-x-auto px-3" role="group" aria-label="Categories">
          {[{ id: null, name: "All" }, ...categories].map((category) => (
            <button
              key={category.id ?? "all"}
              type="button"
              aria-pressed={categoryId === category.id}
              onClick={() => onCategory(category.id)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors",
                categoryId === category.id ? "border-brand-700 bg-brand-700 text-white" : "border-line-strong bg-surface text-ink-muted hover:bg-soft hover:text-ink",
              )}
            >
              {category.name}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {status === "loading" ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6" aria-label="Loading products">
            {Array.from({ length: 10 }, (_, index) => (
              <Skeleton key={index} className="aspect-[4/5]" />
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
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
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
      className="group flex h-full w-full flex-col rounded-lg border border-line bg-surface p-2 text-left transition-[border-color,box-shadow] hover:border-brand-300 hover:shadow-[var(--shadow-raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 active:translate-y-px"
    >
      <span className="relative block aspect-square overflow-hidden rounded-md bg-soft">
        {item.imageUrl ? (
          <Image src={item.imageUrl} alt="" fill sizes={TILE_IMAGE_SIZES} className="object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center text-ink-subtle">
            <ImageOff className="h-7 w-7" aria-hidden="true" />
          </span>
        )}
        {stockNote ? (
          <span className={cn("absolute left-1.5 top-1.5 rounded-sm px-1.5 py-0.5 text-[11px] font-semibold", item.stockMilli <= 0 ? "bg-warning-soft text-warning" : "bg-gold-100 text-gold-700")}>
            {stockNote}
          </span>
        ) : null}
      </span>
      <span className="mt-2 line-clamp-2 text-sm font-semibold leading-snug text-ink">{item.productName}</span>
      <span className="truncate text-xs text-ink-muted">{item.variantName}</span>
      <span className="mt-auto pt-1.5 text-sm">
        <span className="font-bold tabular-nums text-brand-800">{formatMoney(price)}</span>{" "}
        {price < item.priceMinor ? <s className="text-xs text-ink-subtle">{formatMoney(item.priceMinor)}</s> : null}{" "}
        <span className="text-xs text-ink-muted">{UNIT_INFO[item.unit].per}</span>
      </span>
    </button>
  );
}
