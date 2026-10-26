import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { ImageOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ProductCardView } from "@/lib/catalog-types";
import { discountPercent } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { CardAddButton } from "./add-to-cart";
import { Price } from "./price";
import { WishlistButton } from "./wishlist-button";

interface ProductCardProps {
  product: ProductCardView;
  saved: boolean;
  priority?: boolean;
}

export function ProductCard({ product, saved, priority = false }: ProductCardProps) {
  const variant = product.defaultVariant;
  const discount = variant ? discountPercent(variant) : null;
  const href = `/products/${product.slug}`;

  return (
    <article className="group relative flex h-full flex-col rounded-xl border border-line bg-surface p-2.5 transition-[border-color,box-shadow,transform] duration-200 hover:border-brand-200 hover:shadow-[var(--shadow-raised)] motion-safe:hover:-translate-y-0.5 sm:p-3">
      <div className="relative aspect-square overflow-hidden rounded-lg bg-soft">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.imageAlt}
            fill
            priority={priority}
            sizes="(min-width: 1280px) 220px, (min-width: 768px) 25vw, 45vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-ink-subtle">
            <ImageOff className="h-8 w-8" aria-hidden="true" />
          </div>
        )}
        <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
          {discount ? <Badge tone="sale">{discount}% off</Badge> : null}
          {variant && !variant.inStock ? <Badge tone="neutral" className="bg-surface/95 ring-1 ring-line">Out of stock</Badge> : null}
          {variant?.inStock && variant.lowStock ? <Badge tone="gold">Few left</Badge> : null}
          {variant?.inStock && variant.tiers.length > 0 ? <Badge tone="info">Bulk deal</Badge> : null}
        </div>
        <WishlistButton
          productId={product.id}
          productName={product.name}
          initialSaved={saved}
          className="absolute right-2 top-2 z-10"
        />
      </div>

      <div className="mt-3 flex flex-1 flex-col">
        <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-leaf-600">{product.categoryName}</p>
        <h3 className="mt-1 line-clamp-2 min-h-[2.6em] text-[14px] font-semibold leading-snug text-ink transition-colors group-hover:text-brand-700 sm:text-[15px]">
          <Link href={href} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">
            {product.name}
          </Link>
        </h3>
        {variant ? (
          <>
            <p className="mt-0.5 text-xs text-ink-muted">{variant.name}</p>
            <Price
              className="mt-2"
              size="md"
              priceMinor={variant.priceMinor}
              effectivePriceMinor={variant.effectivePriceMinor}
              unit={variant.unit}
            />
            <div className="relative z-10 mt-auto pt-3">
              {product.variantCount > 1 ? (
                <Link
                  href={href}
                  className={cn(
                    "inline-flex h-9 w-full items-center justify-center rounded-lg bg-brand-50 text-[13px] font-semibold text-brand-800 transition-colors hover:bg-brand-700 hover:text-white",
                  )}
                >
                  Choose options ({product.variantCount})
                </Link>
              ) : (
                <CardAddButton variant={variant} productName={product.name} />
              )}
            </div>
          </>
        ) : null}
      </div>
    </article>
  );
}

interface ProductGridProps {
  products: ProductCardView[];
  savedIds: Set<string>;
  priorityCount?: number;
  className?: string;
}

export function ProductGrid({ products, savedIds, priorityCount = 0, className }: ProductGridProps) {
  return (
    <ul className={cn("grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5", className)}>
      {products.map((product, index) => (
        <li key={product.id} className="reveal" style={{ "--i": index } as CSSProperties}>
          <ProductCard product={product} saved={savedIds.has(product.id)} priority={index < priorityCount} />
        </li>
      ))}
    </ul>
  );
}
