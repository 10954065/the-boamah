import type { PriceTierRule } from "./pricing";
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
  /** Bulk prices that beat the regular/sale price, smallest quantity first. */
  tiers: PriceTierRule[];
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
  /** Approved reviews only; null when there are none (or not loaded). */
  rating: { average: number; count: number } | null;
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

/** A product photo tile in the rotating homepage hero. */
export interface HeroProduct {
  slug: string;
  name: string;
  imageUrl: string;
  imageAlt: string;
  /** Published within the last few weeks. */
  isNew: boolean;
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
