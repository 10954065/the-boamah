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
    <article className="group relative flex h-full flex-col rounded-lg border border-line bg-surface p-3 transition-[border-color,box-shadow] duration-200 hover:border-brand-200 hover:shadow-[var(--shadow-raised)]">
      <div className="relative aspect-square overflow-hidden rounded-md bg-soft">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.imageAlt}
            fill
            priority={priority}
            sizes="(min-width: 1280px) 220px, (min-width: 768px) 25vw, 45vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-ink-subtle">
            <ImageOff className="h-8 w-8" aria-hidden="true" />
          </div>
        )}
        <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
          {discount ? <Badge tone="sale">{discount}% off</Badge> : null}
          {variant && !variant.inStock ? <Badge tone="neutral" className="bg-surface/95 ring-1 ring-line">Out of stock</Badge> : null}
        </div>
        <WishlistButton
          productId={product.id}
          productName={product.name}
          initialSaved={saved}
          className="absolute right-2 top-2 z-10"
        />
      </div>

      <div className="mt-3 flex flex-1 flex-col">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-leaf-600">{product.categoryName}</p>
        <h3 className="mt-1 line-clamp-2 min-h-[2.6em] text-[14px] font-semibold leading-snug text-ink">
          <Link href={href} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">
            {product.name}
          </Link>
        </h3>
        {variant ? (
          <>
            <p className="mt-0.5 text-xs text-ink-muted">{variant.name}</p>
            <Price
              className="mt-2"
              size="sm"
              priceMinor={variant.priceMinor}
              effectivePriceMinor={variant.effectivePriceMinor}
              unit={variant.unit}
            />
            <div className="relative z-10 mt-auto pt-3">
              {product.variantCount > 1 ? (
                <Link
                  href={href}
                  className={cn(
                    "inline-flex h-8 w-full items-center justify-center rounded-md border border-brand-600 text-[13px] font-semibold text-brand-700 transition-colors hover:bg-brand-50",
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
        <li key={product.id}>
          <ProductCard product={product} saved={savedIds.has(product.id)} priority={index < priorityCount} />
        </li>
      ))}
    </ul>
  );
}
