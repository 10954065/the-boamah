"use client";

import { useRouter } from "next/navigation";
import { Check, ShoppingBasket } from "lucide-react";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { addToCart } from "@/actions/cart";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/feedback";
import type { VariantView } from "@/lib/catalog-types";
import { formatQuantity } from "@/lib/quantity";
import { cn } from "@/lib/utils";
import { QuantityStepper } from "./quantity-stepper";

function maxSelectable(variant: VariantView): number {
  const cap = variant.maxQtyMilli ?? Number.MAX_SAFE_INTEGER;
  return Math.max(variant.minQtyMilli, Math.min(variant.availableMilli, cap));
}

function useAddToCart() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const add = (variantId: string, quantityMilli: number, productName: string, onAdded?: () => void) =>
    startTransition(async () => {
      const result = await addToCart({ variantId, quantityMilli });
      if (result.ok) {
        onAdded?.();
        toast.success(result.message ?? `${productName} added to your cart.`, {
          action: { label: "View cart", onClick: () => router.push("/cart") },
        });
      } else {
        toast.error(result.error);
      }
    });
  return { pending, add };
}

/** True for a moment after a successful add, so the button can confirm it. */
function useAddedFlash() {
  const [added, setAdded] = useState(false);
  useEffect(() => {
    if (!added) return;
    const timer = setTimeout(() => setAdded(false), 1800);
    return () => clearTimeout(timer);
  }, [added]);
  return [added, () => setAdded(true)] as const;
}

interface CardAddButtonProps {
  variant: VariantView;
  productName: string;
  className?: string;
}

/** Compact control for product cards: adds the minimum quantity. */
export function CardAddButton({ variant, productName, className }: CardAddButtonProps) {
  const { pending, add } = useAddToCart();
  const [added, flash] = useAddedFlash();
  if (!variant.inStock) {
    return (
      <Button variant="outline" size="sm" disabled className={cn("h-9 w-full rounded-lg", className)}>
        Out of stock
      </Button>
    );
  }
  const label = variant.minQtyMilli === 1000 ? "Add to cart" : `Add ${formatQuantity(variant.minQtyMilli, variant.unit)}`;
  return (
    <Button
      size="sm"
      className={cn(
        "h-9 w-full rounded-lg shadow-none",
        added ? "bg-brand-700 text-white hover:bg-brand-700" : "bg-brand-50 text-brand-800 hover:bg-brand-700 hover:text-white",
        className,
      )}
      disabled={pending}
      onClick={() => add(variant.id, variant.minQtyMilli, productName, flash)}
      aria-label={added ? `Added ${productName} to your cart` : `${label}: ${productName}`}
    >
      {pending ? <Spinner label="Adding" /> : added ? <Check className="pop" /> : <ShoppingBasket />}
      {added ? "Added" : label}
    </Button>
  );
}

interface ProductPurchaseProps {
  variants: VariantView[];
  productName: string;
  /** Shown beside the add button, e.g. the wishlist toggle. */
  secondaryAction?: ReactNode;
}

/** Variant picker + quantity stepper + add button for the product page. */
export function ProductPurchase({ variants, productName, secondaryAction }: ProductPurchaseProps) {
  const [variantId, setVariantId] = useState(variants[0]?.id ?? "");
  const variant = variants.find((v) => v.id === variantId) ?? variants[0];
  const [quantity, setQuantity] = useState(variant?.minQtyMilli ?? 1000);
  const { pending, add } = useAddToCart();
  const [added, flash] = useAddedFlash();

  if (!variant) return null;

  const selectVariant = (id: string) => {
    const next = variants.find((v) => v.id === id);
    if (!next) return;
    setVariantId(id);
    setQuantity(next.minQtyMilli);
  };

  return (
    <div className="space-y-5">
      {variants.length > 1 ? (
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-ink">Size / option</legend>
          <div className="flex flex-wrap gap-2">
            {variants.map((v) => (
              <label
                key={v.id}
                className={cn(
                  "cursor-pointer rounded-md border px-3.5 py-2 text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500",
                  v.id === variant.id
                    ? "border-brand-700 bg-brand-50 text-brand-800"
                    : "border-line-strong bg-surface text-ink hover:border-ink-subtle",
                  !v.inStock && "text-ink-subtle line-through decoration-1",
                )}
              >
                <input
                  type="radio"
                  name="variant"
                  value={v.id}
                  checked={v.id === variant.id}
                  onChange={() => selectVariant(v.id)}
                  className="sr-only"
                />
                {v.name}
                {!v.inStock ? <span className="sr-only"> (out of stock)</span> : null}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {variant.inStock ? (
        <div className="flex flex-wrap items-center gap-3">
          <QuantityStepper
            value={quantity}
            onChange={setQuantity}
            stepMilli={variant.stepMilli}
            minMilli={variant.minQtyMilli}
            maxMilli={maxSelectable(variant)}
            unit={variant.unit}
            label={`Quantity of ${productName}`}
          />
          <Button size="lg" className="min-w-48 flex-1 sm:flex-none" disabled={pending} onClick={() => add(variant.id, quantity, productName, flash)}>
            {pending ? <Spinner label="Adding" /> : added ? <Check className="pop" /> : <ShoppingBasket />}
            {added ? "Added to cart" : "Add to cart"}
          </Button>
          {secondaryAction}
        </div>
      ) : (
        <>
          <div className="rounded-md border border-line bg-soft px-4 py-3 text-sm text-ink-muted" role="status">
            <strong className="text-ink">Currently unavailable.</strong> This option is out of stock and cannot be purchased
            right now. Please check back soon{variants.length > 1 ? " or choose another option" : ""}.
          </div>
          {secondaryAction}
        </>
      )}
      {variant.inStock && variant.lowStock ? (
        <p className="text-sm font-medium text-warning">Only {formatQuantity(variant.availableMilli, variant.unit)} left in stock.</p>
      ) : null}
    </div>
  );
}
