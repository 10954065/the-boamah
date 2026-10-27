"use client";

import Image from "next/image";
import Link from "next/link";
import { Plus, ShoppingBasket } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addToCart } from "@/actions/cart";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/feedback";
import type { ProductCardView } from "@/lib/catalog-types";
import { formatMoney } from "@/lib/money";
import { formatQuantity, lineTotalMinor } from "@/lib/quantity";
import { cn } from "@/lib/utils";
import { useCartDrawer } from "./cart-drawer";

interface BoughtTogetherProps {
  /** The product being viewed first, then the products bought with it. */
  products: ProductCardView[];
}

function bundlePrice(product: ProductCardView): number {
  const variant = product.defaultVariant;
  return variant ? lineTotalMinor(variant.effectivePriceMinor, variant.minQtyMilli) : 0;
}

/** "Often bought together": tick what you want and add it all in one go. */
export function BoughtTogether({ products }: BoughtTogetherProps) {
  const buyable = products.filter((p) => p.defaultVariant?.inStock);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(buyable.map((p) => p.id)));
  const [pending, startTransition] = useTransition();
  const { openCart } = useCartDrawer();

  const chosen = buyable.filter((p) => selected.has(p.id));
  const total = chosen.reduce((sum, p) => sum + bundlePrice(p), 0);

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const addAll = () =>
    startTransition(async () => {
      let added = 0;
      for (const product of chosen) {
        const variant = product.defaultVariant!;
        const result = await addToCart({ variantId: variant.id, quantityMilli: variant.minQtyMilli });
        if (result.ok) added += 1;
        else toast.error(`${product.name}: ${result.error}`);
      }
      if (added > 0) openCart(`${added} item${added === 1 ? "" : "s"} added to your cart.`);
    });

  return (
    <div className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <ul className="flex flex-wrap items-center gap-2 sm:gap-3">
        {buyable.map((product, index) => {
          const isSelected = selected.has(product.id);
          const variant = product.defaultVariant!;
          return (
            <li key={product.id} className="flex items-center gap-2 sm:gap-3">
              {index > 0 ? <Plus className="h-4 w-4 shrink-0 text-ink-subtle" aria-hidden="true" /> : null}
              <div
                className={cn(
                  "w-[132px] rounded-lg border p-2 transition-[border-color,opacity,transform] duration-200 sm:w-[150px]",
                  isSelected ? "border-brand-300 bg-brand-50/40" : "border-line opacity-55",
                )}
              >
                <Link href={`/products/${product.slug}`} tabIndex={-1} aria-hidden="true" className="relative block aspect-square overflow-hidden rounded-md bg-soft">
                  {product.imageUrl ? <Image src={product.imageUrl} alt="" fill sizes="150px" className="object-cover" /> : null}
                </Link>
                <label className="mt-2 flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(product.id)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-brand-700"
                  />
                  <span className="min-w-0">
                    <span className="line-clamp-2 text-xs font-semibold leading-snug text-ink">
                      {index === 0 ? <span className="text-brand-700">This item: </span> : null}
                      {product.name}
                    </span>
                    <span className="mt-0.5 block text-xs tabular-nums text-ink-muted">
                      {formatMoney(bundlePrice(product))}
                      {variant.minQtyMilli !== 1000 ? ` for ${formatQuantity(variant.minQtyMilli, variant.unit)}` : ""}
                    </span>
                  </span>
                </label>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <p className="text-sm" aria-live="polite">
          {chosen.length === 0 ? (
            <span className="text-ink-muted">Tick the items you want.</span>
          ) : (
            <>
              Total for {chosen.length} item{chosen.length === 1 ? "" : "s"}:{" "}
              <strong className="font-display text-base tabular-nums">{formatMoney(total)}</strong>
            </>
          )}
        </p>
        <Button onClick={addAll} disabled={pending || chosen.length === 0}>
          {pending ? <Spinner label="Adding" /> : <ShoppingBasket />}
          {chosen.length === buyable.length ? "Add all to cart" : "Add selected to cart"}
        </Button>
      </div>
    </div>
  );
}
