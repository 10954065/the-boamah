import Image from "next/image";
import Link from "next/link";
import { LayoutGrid, SearchX } from "lucide-react";
import { Suspense } from "react";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { Checkbox, Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { listingQuery, type ListingParams } from "@/lib/listing-params";
import { cn } from "@/lib/utils";
import { getActiveCategories, listProducts, PAGE_SIZE, type CategoryView } from "@/server/catalog";
import { CategoryRail } from "./category-rail";
import { FiltersSheet } from "./filters-sheet";
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

type CategoryNavProps = ProductListingProps & { categories: CategoryView[] };

/** Where a category link goes, keeping the current search, sort and filters. */
function categoryHref({ basePath, params }: ProductListingProps, slug: string): string {
  if (basePath === "/offers" || params.q) {
    return `${basePath === "/offers" ? "/offers" : "/shop"}${listingQuery(params, { category: slug, page: 1 })}`;
  }
  const query = listingQuery(params, { category: "", page: 1 });
  return slug ? `/categories/${slug}${query}` : `/shop${query}`;
}

function CategoryThumb({ imageUrl, size }: { imageUrl: string | null; size: number }) {
  return imageUrl ? (
    <Image src={imageUrl} alt="" fill sizes={`${size}px`} className="object-cover" />
  ) : (
    <LayoutGrid className="h-4 w-4 text-brand-700" aria-hidden="true" />
  );
}

function categoryItems({ basePath, params, categories }: CategoryNavProps) {
  // Category totals would mislead on the offers page and in search results.
  const showCounts = basePath !== "/offers" && !params.q;
  const total = categories.reduce((sum, category) => sum + category.productCount, 0);
  return [
    { slug: "", name: basePath === "/offers" ? "All offers" : "All products", imageUrl: null, count: showCounts ? total : null },
    ...categories.map((c) => ({ slug: c.slug, name: c.name, imageUrl: c.imageUrl, count: showCounts ? c.productCount : null })),
  ];
}

function CategoryNav(props: CategoryNavProps) {
  const active = props.fixedCategory ?? props.params.category;
  return (
    <nav aria-label="Categories">
      <h2 className="px-2 pb-2 pt-1 text-xs font-bold uppercase tracking-wider text-ink-subtle">Categories</h2>
      <ul className="space-y-0.5">
        {categoryItems(props).map((item) => {
          const isActive = item.slug === active;
          return (
            <li key={item.slug || "all"}>
              <Link
                href={categoryHref(props, item.slug)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "group relative flex items-center gap-3 rounded-lg py-1.5 pl-3 pr-2 text-sm transition-colors",
                  isActive ? "bg-brand-50 font-semibold text-brand-800" : "text-ink-muted hover:bg-soft hover:text-ink",
                )}
              >
                <span
                  className={cn(
                    "absolute inset-y-2 left-0 w-1 rounded-full bg-brand-600 transition-opacity",
                    isActive ? "opacity-100" : "opacity-0",
                  )}
                  aria-hidden="true"
                />
                <span
                  className={cn(
                    "relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-soft ring-1 transition-transform duration-200 group-hover:scale-105",
                    isActive ? "ring-brand-300" : "ring-line",
                  )}
                >
                  <CategoryThumb imageUrl={item.imageUrl} size={36} />
                </span>
                <span className="min-w-0 flex-1 leading-tight">{item.name}</span>
                {item.count !== null ? (
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums transition-colors",
                      isActive ? "bg-brand-700 text-white" : "bg-soft text-ink-subtle group-hover:bg-surface",
                    )}
                  >
                    {item.count}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Swipeable category chips for phones and tablets. */
function CategoryChips(props: CategoryNavProps) {
  const active = props.fixedCategory ?? props.params.category;
  return (
    <nav aria-label="Categories" className="-mx-4 mb-2.5 sm:-mx-6 lg:hidden">
      <CategoryRail activeKey={active}>
        {categoryItems(props).map((item) => {
          const isActive = item.slug === active;
          return (
            <li key={item.slug || "all"} className="shrink-0 snap-start">
              <Link
                href={categoryHref(props, item.slug)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-full border py-1 pl-1 pr-3.5 text-[13px] font-medium transition-colors",
                  isActive ? "border-brand-700 bg-brand-700 text-white" : "border-line bg-surface text-ink hover:border-brand-200",
                )}
              >
                <span className="relative flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-soft">
                  <CategoryThumb imageUrl={item.imageUrl} size={28} />
                </span>
                {item.name}
              </Link>
            </li>
          );
        })}
      </CategoryRail>
    </nav>
  );
}

function FiltersForm({ basePath, params, fixedCategory, fixedOnSale, idPrefix }: ProductListingProps & { idPrefix: string }) {
  return (
    <form action={basePath} method="get" className="space-y-7">
      {params.q ? <input type="hidden" name="q" value={params.q} /> : null}
      {params.sort !== "featured" ? <input type="hidden" name="sort" value={params.sort} /> : null}

      {params.category && !fixedCategory ? <input type="hidden" name="category" value={params.category} /> : null}

      <fieldset>
        <legend className="text-sm font-bold text-ink">Price (GH₵)</legend>
        <div className="mt-3 flex items-center gap-2">
          <label className="sr-only" htmlFor={`${idPrefix}-min`}>
            Minimum price in Ghana cedis
          </label>
          <Input id={`${idPrefix}-min`} name="min" inputMode="decimal" placeholder="Min" defaultValue={params.minPrice} className="h-9" />
          <span className="text-sm text-ink-subtle" aria-hidden="true">
            to
          </span>
          <label className="sr-only" htmlFor={`${idPrefix}-max`}>
            Maximum price in Ghana cedis
          </label>
          <Input id={`${idPrefix}-max`} name="max" inputMode="decimal" placeholder="Max" defaultValue={params.maxPrice} className="h-9" />
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
  const [page, categories] = await Promise.all([
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
  ]);

  const filterProps = { basePath, params, fixedCategory, fixedOnSale };
  const from = page.total === 0 ? 0 : (page.page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page.page * PAGE_SIZE, page.total);
  const activeFilters = [params.minPrice, params.maxPrice, params.inStock, params.onSale && !fixedOnSale].filter(Boolean).length;

  return (
    <div className="grid gap-8 lg:grid-cols-[264px_1fr]">
      <aside aria-label="Categories and filters" className="hidden space-y-4 lg:block">
        <div className="rounded-xl border border-line bg-surface p-2.5">
          <CategoryNav {...filterProps} categories={categories} />
        </div>
        <div className="rounded-xl border border-line bg-surface p-5">
          <FiltersForm {...filterProps} idPrefix="filter" />
        </div>
      </aside>

      <div className="min-w-0">
        <CategoryChips {...filterProps} categories={categories} />
        <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 lg:mb-5 lg:justify-between lg:rounded-lg lg:border lg:border-line lg:bg-surface lg:px-4 lg:py-3">
          <FiltersSheet activeCount={activeFilters}>
            <FiltersForm {...filterProps} idPrefix="sheet" />
          </FiltersSheet>
          <p className="order-last w-full text-[13px] text-ink-muted lg:order-none lg:w-auto lg:text-sm" aria-live="polite">
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
            <ProductGrid products={page.items} priorityCount={4} className={cn("xl:grid-cols-4")} />
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
