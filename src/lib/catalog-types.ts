import type { SellingUnitCode } from "./quantity";

/** Serializable variant data safe to send to client components. */
export interface VariantView {
  id: string;
  name: string;
  sku: string;
  unit: SellingUnitCode;
  priceMinor: number;
  salePriceMinor: number | null;
  effectivePriceMinor: number;
  stepMilli: number;
  minQtyMilli: number;
  maxQtyMilli: number | null;
  /** Purchasable quantity right now (respects stock and max). */
  availableMilli: number;
  inStock: boolean;
  lowStock: boolean;
}

export interface ProductCardView {
  id: string;
  slug: string;
  name: string;
  categoryName: string;
  categorySlug: string;
  imageUrl: string | null;
  imageAlt: string;
  isFeatured: boolean;
  variantCount: number;
  defaultVariant: VariantView | null;
}

export interface ProductDetailView extends ProductCardView {
  description: string;
  shortDescription: string | null;
  categoryId: string;
  images: { id: string; url: string; alt: string; credit: string | null }[];
  variants: VariantView[];
  publishedAt: string | null;
  updatedAt: string;
}

export const SORT_OPTIONS = [
  { value: "featured", label: "Featured" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "newest", label: "Newest" },
  { value: "name", label: "Name (A to Z)" },
] as const;

export type SortOption = (typeof SORT_OPTIONS)[number]["value"];

export function isSortOption(value: unknown): value is SortOption {
  return SORT_OPTIONS.some((option) => option.value === value);
}
