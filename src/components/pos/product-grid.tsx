"use client";

import Image from "next/image";
import { useId, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { ArrowLeft, ImageOff, LayoutGrid, RefreshCw, ScanBarcode, X } from "lucide-react";
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

/** Product cards, the matches and the sale alike: as many across as the space holds. */
export const CARD_GRID = "grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))]";

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
  /** Shown while nothing is being looked up, so the whole shop is not piled on the screen. */
  idle: ReactNode;
}

/** The scan box and, once something is typed or a category is opened, the matching products. */
export function ProductGrid(props: ProductGridProps) {
  const { results, categories, categoryId, onCategory, query, onQuery, onSubmitSearch, searchRef, status, error, onRetry, onPick, now, idle } = props;
  const [browsing, setBrowsing] = useState(false);
  const categoriesId = useId();
  const lookingUp = query.trim() !== "" || categoryId !== null;
  const categoryName = categories.find((category) => category.id === categoryId)?.name;

  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmitSearch();
  }

  function backToSale() {
    onQuery("");
    onCategory(null);
    searchRef.current?.focus();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-3 pt-3 md:px-4">
        <div className="flex gap-2">
          <form
            onSubmit={submit}
            role="search"
            className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border-2 border-brand-500 bg-surface py-1.5 pl-1.5 pr-2 shadow-[var(--shadow-card)] transition-shadow focus-within:shadow-[0_0_0_4px_rgb(38_118_78/0.15)]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-700 text-white">
              <ScanBarcode className="h-5 w-5" aria-hidden="true" />
            </span>
            <label className="min-w-0 flex-1">
              <span className="block text-[11px] font-bold uppercase leading-4 tracking-wider text-brand-700">Scan or search</span>
              <input
                ref={searchRef}
                type="search"
                autoFocus
                autoComplete="off"
                enterKeyHint="enter"
                aria-label="Search products or scan a barcode"
                placeholder="Scan a barcode or type a product name (F2)"
                value={query}
                onChange={(event) => onQuery(event.target.value)}
                className="block w-full bg-transparent text-base font-semibold leading-6 text-ink placeholder:font-normal placeholder:text-ink-subtle focus:outline-none [&::-webkit-search-cancel-button]:hidden"
              />
            </label>
            {query ? (
              <button type="button" onClick={backToSale} aria-label="Clear search" className="rounded-md p-1.5 text-ink-subtle hover:bg-soft hover:text-ink">
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </form>
          <button
            type="button"
            aria-expanded={browsing}
            aria-controls={categoriesId}
            onClick={() => setBrowsing((open) => !open)}
            className={cn(
              "flex w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border text-[11px] font-semibold shadow-[var(--shadow-card)] transition-colors sm:w-24",
              browsing ? "border-brand-700 bg-brand-700 text-white" : "border-line bg-surface text-ink-muted hover:border-brand-300 hover:text-ink",
            )}
          >
            <LayoutGrid className="h-5 w-5" aria-hidden="true" />
            Categories
          </button>
        </div>
        {browsing ? (
          <div id={categoriesId} role="group" aria-label="Categories" className="mt-2 flex flex-wrap gap-1.5 rounded-xl border border-line bg-surface p-2 shadow-[var(--shadow-card)]">
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                aria-pressed={categoryId === category.id}
                onClick={() => {
                  onCategory(category.id);
                  setBrowsing(false);
                }}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors",
                  categoryId === category.id ? "border-brand-700 bg-brand-700 text-white" : "border-line-strong bg-surface text-ink-muted hover:bg-soft hover:text-ink",
                )}
              >
                {category.name}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-3 md:px-4 md:pb-4">
        {status === "error" ? (
          <Alert tone="danger" title="The products could not be loaded">
            <p>{error}</p>
            <Button size="sm" variant="outline" className="mt-2" onClick={onRetry}>
              <RefreshCw /> Try again
            </Button>
          </Alert>
        ) : !lookingUp ? (
          idle
        ) : (
          <section aria-labelledby="till-results-title">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 id="till-results-title" className="truncate text-xs font-bold uppercase tracking-wider text-ink-muted">
                {categoryName && !query.trim() ? categoryName : `Matches for “${query.trim()}”`}{" "}
                <span className="font-semibold text-ink-subtle">({Math.min(results.length, MAX_TILES)})</span>
              </h2>
              <Button variant="ghost" size="sm" onClick={backToSale}>
                <ArrowLeft /> Back to the sale
              </Button>
            </div>
            {status === "loading" ? (
              <div className={CARD_GRID} aria-label="Loading products">
                {Array.from({ length: 6 }, (_, index) => (
                  <Skeleton key={index} className="h-44" />
                ))}
              </div>
            ) : results.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line-strong py-10 text-center text-sm text-ink-muted">
                {query ? `No products match "${query}".` : "No products in this category."}
              </p>
            ) : (
              <>
                <ul className={CARD_GRID}>
                  {results.slice(0, MAX_TILES).map((item) => (
                    <li key={item.variantId}>
                      <ProductCard item={item} now={now} onPick={onPick} />
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
          </section>
        )}
      </div>
    </div>
  );
}

/** A product photo on white, the same size on every card. */
export function CardPhoto({ src, alt, children }: { src: string | null; alt: string; children?: ReactNode }) {
  return (
    <span className="relative block aspect-[16/10] bg-white">
      {src ? (
        <Image src={src} alt={alt} fill sizes={TILE_IMAGE_SIZES} className="object-contain p-1" />
      ) : (
        <span className="flex h-full items-center justify-center text-xs text-ink-subtle">
          <ImageOff className="mr-1 h-4 w-4" aria-hidden="true" /> No photo
        </span>
      )}
      {children}
    </span>
  );
}

function stockPill(item: PosCatalogItem): { text: string; className: string } {
  if (item.stockMilli <= 0) return { text: "None in stock", className: "bg-warning-soft text-warning" };
  const amount = formatQuantity(item.stockMilli, item.unit);
  if (item.stockMilli <= item.lowStockMilli) return { text: `${amount} left`, className: "bg-gold-100 text-gold-700" };
  return { text: `${amount} in stock`, className: "bg-success-soft text-success" };
}

function ProductCard({ item, now, onPick }: { item: PosCatalogItem; now: Date; onPick: (item: PosCatalogItem) => void }) {
  const price = effectiveUnitPrice(item, now);
  const stock = stockPill(item);
  return (
    <button
      type="button"
      onClick={() => onPick(item)}
      className="group flex h-full w-full flex-col overflow-hidden rounded-xl border border-line bg-surface text-left shadow-[var(--shadow-card)] transition-[border-color,box-shadow] hover:border-brand-300 hover:shadow-[var(--shadow-raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 active:bg-brand-50"
    >
      <CardPhoto src={item.imageUrl} alt="" />
      <span className="flex flex-1 flex-col border-t border-line p-2">
        <span className="line-clamp-2 text-[13px] font-semibold leading-4.25 text-ink">{item.productName}</span>
        <span className="truncate text-[11px] leading-4 text-ink-muted">{item.variantName}</span>
        <span className="mt-auto flex items-baseline gap-1 pt-1.5">
          <span className="text-sm font-extrabold tabular-nums text-brand-700">{formatMoney(price)}</span>
          <span className="truncate text-[11px] text-ink-muted">{UNIT_INFO[item.unit].per}</span>
          {price < item.priceMinor ? <s className="ml-auto shrink-0 text-[11px] text-ink-subtle">{formatMoney(item.priceMinor)}</s> : null}
        </span>
        <span className={cn("mt-1 inline-flex max-w-full items-center gap-1 self-start rounded-full px-1.5 py-0.5 text-[10px] font-semibold", stock.className)}>
          <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
          <span className="truncate">{stock.text}</span>
        </span>
      </span>
    </button>
  );
}
