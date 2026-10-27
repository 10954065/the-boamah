"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Eye } from "lucide-react";
import { useState, useTransition } from "react";
import { getQuickView } from "@/actions/catalog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Alert, Spinner } from "@/components/ui/feedback";
import type { ProductDetailView } from "@/lib/catalog-types";
import { cn } from "@/lib/utils";
import { ProductPurchase } from "./add-to-cart";
import { Price } from "./price";

interface QuickViewButtonProps {
  slug: string;
  name: string;
  className?: string;
}

/** "Quick view" on product cards: price, options and add to cart without leaving the page. */
export function QuickViewButton({ slug, name, className }: QuickViewButtonProps) {
  const [open, setOpen] = useState(false);
  const [product, setProduct] = useState<ProductDetailView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();

  const show = () => {
    setOpen(true);
    if (product) return;
    setError(null);
    startLoading(async () => {
      const result = await getQuickView({ slug });
      if (result.ok) setProduct(result.data);
      else setError(result.error);
    });
  };

  const variant = product?.defaultVariant;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={show}
        aria-label={`Quick view: ${name}`}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full bg-surface/95 px-3.5 py-1.5 text-xs font-bold text-ink shadow-[var(--shadow-raised)] ring-1 ring-line backdrop-blur transition-[opacity,transform,background-color] duration-200 hover:bg-brand-700 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
          className,
        )}
      >
        <Eye className="h-3.5 w-3.5" aria-hidden="true" /> Quick view
      </button>
      <DialogContent title={product?.name ?? name} hideTitle={Boolean(product)} className="max-w-3xl p-0 sm:p-0">
        {error ? (
          <div className="p-6">
            <Alert tone="danger">{error}</Alert>
          </div>
        ) : !product || loading ? (
          <div className="flex justify-center py-20">
            <Spinner label="Loading product" />
          </div>
        ) : (
          <div className="grid gap-0 md:grid-cols-2">
            <div className="relative aspect-square bg-soft md:aspect-auto md:min-h-[420px]">
              {product.imageUrl ? (
                <Image src={product.imageUrl} alt={product.imageAlt} fill sizes="(min-width: 768px) 384px, 100vw" className="object-cover md:rounded-l-lg" />
              ) : null}
            </div>
            <div className="flex flex-col gap-4 p-5 sm:p-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-leaf-600">{product.categoryName}</p>
                <p className="mt-1 font-display text-xl font-extrabold leading-tight">{product.name}</p>
                {product.shortDescription ? <p className="mt-2 text-sm leading-6 text-ink-muted">{product.shortDescription}</p> : null}
              </div>
              {variant ? <Price size="lg" priceMinor={variant.priceMinor} effectivePriceMinor={variant.effectivePriceMinor} unit={variant.unit} /> : null}
              <ProductPurchase variants={product.variants} productName={product.name} onAdded={() => setOpen(false)} />
              <Link
                href={`/products/${product.slug}`}
                onClick={() => setOpen(false)}
                className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
              >
                See full details and reviews <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
