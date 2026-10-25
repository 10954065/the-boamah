import { isSortOption, type SortOption } from "./catalog-types";
import { parseDecimalToMinor } from "./money";

export type RawSearchParams = Record<string, string | string[] | undefined>;

export interface ListingParams {
  q: string;
  category: string;
  minPrice: string;
  maxPrice: string;
  minPriceMinor?: number;
  maxPriceMinor?: number;
  inStock: boolean;
  onSale: boolean;
  sort: SortOption;
  page: number;
}

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

/** Validates listing query parameters; invalid values fall back to defaults. */
export function parseListingParams(raw: RawSearchParams): ListingParams {
  const minPrice = first(raw.min).slice(0, 12);
  const maxPrice = first(raw.max).slice(0, 12);
  const sort = first(raw.sort);
  const page = Number.parseInt(first(raw.page), 10);
  const category = first(raw.category).toLowerCase();
  return {
    q: first(raw.q).slice(0, 100),
    category: /^[a-z0-9-]{1,80}$/.test(category) ? category : "",
    minPrice,
    maxPrice,
    minPriceMinor: minPrice ? parseDecimalToMinor(minPrice) ?? undefined : undefined,
    maxPriceMinor: maxPrice ? parseDecimalToMinor(maxPrice) ?? undefined : undefined,
    inStock: first(raw.stock) === "1",
    onSale: first(raw.sale) === "1",
    sort: isSortOption(sort) ? sort : "featured",
    page: Number.isFinite(page) && page > 0 ? Math.min(page, 500) : 1,
  };
}

/** Serialises listing params back to a query string, dropping defaults. */
export function listingQuery(params: Partial<ListingParams>, overrides: Partial<ListingParams> = {}): string {
  const merged = { ...params, ...overrides };
  const search = new URLSearchParams();
  if (merged.q) search.set("q", merged.q);
  if (merged.category) search.set("category", merged.category);
  if (merged.minPrice) search.set("min", merged.minPrice);
  if (merged.maxPrice) search.set("max", merged.maxPrice);
  if (merged.inStock) search.set("stock", "1");
  if (merged.onSale) search.set("sale", "1");
  if (merged.sort && merged.sort !== "featured") search.set("sort", merged.sort);
  if (merged.page && merged.page > 1) search.set("page", String(merged.page));
  const query = search.toString();
  return query ? `?${query}` : "";
}

export function hasActiveFilters(params: ListingParams): boolean {
  return Boolean(params.q || params.minPrice || params.maxPrice || params.inStock || params.onSale || params.page > 1 || params.sort !== "featured");
}
