import Link from "next/link";
import { SearchX, SlidersHorizontal } from "lucide-react";
import { Suspense } from "react";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { Checkbox, Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { listingQuery, type ListingParams } from "@/lib/listing-params";
import { cn } from "@/lib/utils";
import { getActiveCategories, listProducts, PAGE_SIZE } from "@/server/catalog";
import { getWishlistIds } from "@/server/wishlist";
import { ProductGrid } from "./product-card";
import { SortSelect } from "./sort-select";

interface ProductListingProps {
  basePath: string;
  params: ListingParams;
  /** Category fixed by the route (category pages). */
  fixedCategory?: string;
  /** Sale filter fixed by the route (offers page). */
  fixedOnSale?: boolean;
}

function FiltersForm({ basePath, params, fixedCategory, fixedOnSale, categories }: ProductListingProps & { categories: { slug: string; name: string; productCount: number }[] }) {
  const activeCategory = fixedCategory ?? params.category;
  return (
    <form action={basePath} method="get" className="space-y-7">
      {params.q ? <input type="hidden" name="q" value={params.q} /> : null}
      {params.sort !== "featured" ? <input type="hidden" name="sort" value={params.sort} /> : null}

      {!fixedCategory ? (
        <fieldset>
          <legend className="text-sm font-bold text-ink">Category</legend>
          <ul className="mt-3 space-y-1">
            {[{ slug: "", name: "All categories", productCount: -1 }, ...categories].map((category) => (
              <li key={category.slug || "all"}>
                <label className="flex cursor-pointer items-center gap-2.5 rounded px-1 py-1 text-sm text-ink-muted hover:text-ink">
                  <input
                    type="radio"
                    name="category"
                    value={category.slug}
                    defaultChecked={activeCategory === category.slug}
                    className="h-4 w-4 accent-brand-700"
                  />
                  <span className="flex-1">{category.name}</span>
                  {category.productCount >= 0 ? <span className="text-xs text-ink-subtle">{category.productCount}</span> : null}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      ) : null}

      <fieldset>
        <legend className="text-sm font-bold text-ink">Price (GH₵)</legend>
        <div className="mt-3 flex items-center gap-2">
          <label className="sr-only" htmlFor="filter-min">
            Minimum price in Ghana cedis
          </label>
          <Input id="filter-min" name="min" inputMode="decimal" placeholder="Min" defaultValue={params.minPrice} className="h-9" />
          <span className="text-sm text-ink-subtle" aria-hidden="true">
            to
          </span>
          <label className="sr-only" htmlFor="filter-max">
            Maximum price in Ghana cedis
          </label>
          <Input id="filter-max" name="max" inputMode="decimal" placeholder="Max" defaultValue={params.maxPrice} className="h-9" />
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-bold text-ink">Availability</legend>
        <div className="mt-3 space-y-2">
          <label className="flex items-center gap-2.5 text-sm text-ink-muted">
            <Checkbox name="stock" value="1" defaultChecked={params.inStock} /> In stock only
          </label>
          {!fixedOnSale ? (
            <label className="flex items-center gap-2.5 text-sm text-ink-muted">
              <Checkbox name="sale" value="1" defaultChecked={params.onSale} /> On special offer
            </label>
          ) : null}
        </div>
      </fieldset>

      <div className="flex gap-2">
        <button type="submit" className={buttonVariants({ size: "sm", className: "flex-1" })}>
          Apply filters
        </button>
        <Link href={basePath} className={buttonVariants({ size: "sm", variant: "outline" })}>
          Reset
        </Link>
      </div>
    </form>
  );
}

export async function ProductListing({ basePath, params, fixedCategory, fixedOnSale }: ProductListingProps) {
  const [page, categories, savedIds] = await Promise.all([
    listProducts({
      q: params.q || undefined,
      categorySlug: fixedCategory ?? (params.category || undefined),
      minPriceMinor: params.minPriceMinor,
      maxPriceMinor: params.maxPriceMinor,
      inStockOnly: params.inStock,
      onSaleOnly: fixedOnSale || params.onSale,
      sort: params.sort,
      page: params.page,
    }),
    getActiveCategories(),
    getWishlistIds(),
  ]);

  const filterProps = { basePath, params, fixedCategory, fixedOnSale, categories };
  const from = page.total === 0 ? 0 : (page.page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page.page * PAGE_SIZE, page.total);

  return (
    <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
      <aside aria-label="Filters" className="hidden lg:block">
        <div className="sticky top-32 rounded-lg border border-line bg-surface p-5">
          <FiltersForm {...filterProps} />
        </div>
      </aside>

      <div className="min-w-0">
        <details className="mb-4 rounded-lg border border-line bg-surface lg:hidden">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold">
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" /> Filters
          </summary>
          <div className="border-t border-line p-4">
            <FiltersForm {...filterProps} />
          </div>
        </details>

        <div className="mb-5 flex flex-col gap-3 rounded-lg border border-line bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink-muted" aria-live="polite">
            {page.total === 0 ? (
              "No products found"
            ) : (
              <>
                Showing <strong className="text-ink">{from} to {to}</strong> of <strong className="text-ink">{page.total}</strong>{" "}
                {page.total === 1 ? "product" : "products"}
                {params.q ? (
                  <>
                    {" "}
                    for “<strong className="text-ink">{params.q}</strong>”
                  </>
                ) : null}
              </>
            )}
          </p>
          <Suspense>
            <SortSelect value={params.sort} />
          </Suspense>
        </div>

        {page.items.length === 0 ? (
          <div className="rounded-lg border border-line bg-surface">
            <EmptyState
              icon={<SearchX />}
              title={params.q ? `We couldn't find “${params.q}”` : "No products match these filters"}
              description="Try a different search term, remove some filters, or browse all of our categories."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Link href={basePath} className={buttonVariants({ variant: "outline" })}>
                    Clear filters
                  </Link>
                  <Link href="/categories" className={buttonVariants()}>
                    Browse categories
                  </Link>
                </div>
              }
            />
          </div>
        ) : (
          <>
            <ProductGrid products={page.items} savedIds={savedIds} priorityCount={4} className={cn("xl:grid-cols-4")} />
            <Pagination
              className="mt-10"
              page={page.page}
              totalPages={page.totalPages}
              hrefFor={(n) => `${basePath}${listingQuery(params, { page: n })}`}
            />
          </>
        )}
      </div>
    </div>
  );
}
