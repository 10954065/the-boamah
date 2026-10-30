"use client";

import { Check, ShoppingBasket, Tags } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition, type RefObject } from "react";
import { toast } from "sonner";
import { addToCart } from "@/actions/cart";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/feedback";
import type { VariantView } from "@/lib/catalog-types";
import { formatMoney } from "@/lib/money";
import { unitPriceForQuantity } from "@/lib/pricing";
import { formatQuantity, lineTotalMinor, UNIT_INFO } from "@/lib/quantity";
import { cn } from "@/lib/utils";
import { useCartDrawer } from "./cart-drawer";
import { QuantityStepper } from "./quantity-stepper";
import { StockAlertForm } from "./stock-alert-form";

function maxSelectable(variant: VariantView): number {
  const cap = variant.maxQtyMilli ?? Number.MAX_SAFE_INTEGER;
  return Math.max(variant.minQtyMilli, Math.min(variant.availableMilli, cap));
}

export function useAddToCart() {
  const { openCart } = useCartDrawer();
  const [pending, startTransition] = useTransition();
  const add = (variantId: string, quantityMilli: number, productName: string, onAdded?: () => void) =>
    startTransition(async () => {
      const result = await addToCart({ variantId, quantityMilli });
      if (result.ok) {
        onAdded?.();
        openCart(result.message ?? `${productName} added to your cart.`);
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

interface BulkPricingProps {
  variant: VariantView;
  quantity: number;
  onChoose: (quantityMilli: number) => void;
}

/** "Buy more, pay less" tiers, with live feedback for the chosen quantity. */
function BulkPricing({ variant, quantity, onChoose }: BulkPricingProps) {
  const max = maxSelectable(variant);
  const tiers = variant.tiers.filter((t) => t.minQtyMilli <= max);
  if (tiers.length === 0) return null;
  const per = UNIT_INFO[variant.unit].per;
  const unitPrice = unitPriceForQuantity({ priceMinor: variant.priceMinor, salePriceMinor: variant.salePriceMinor, saleEndsAt: variant.saleEndsAt }, tiers, quantity);
  const saving = lineTotalMinor(variant.effectivePriceMinor, quantity) - lineTotalMinor(unitPrice, quantity);
  const next = tiers.find((t) => t.minQtyMilli > quantity);

  return (
    <div role="group" className="rounded-xl border border-gold-300 bg-gold-50 p-4" aria-labelledby="bulk-title">
      <p id="bulk-title" className="flex items-center gap-2 text-sm font-extrabold text-ink">
        <Tags className="h-4 w-4 text-gold-700" aria-hidden="true" /> Buy more, pay less
      </p>
      <ul className="mt-2.5 space-y-1.5">
        {tiers.map((tier) => {
          const reached = quantity >= tier.minQtyMilli;
          return (
            <li key={tier.minQtyMilli} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className={cn(reached ? "font-semibold text-brand-800" : "text-ink-muted")}>
                {reached ? <Check className="pop mr-1 inline h-3.5 w-3.5" aria-hidden="true" /> : null}
                {formatQuantity(tier.minQtyMilli, variant.unit)} or more:{" "}
                <strong className="tabular-nums text-ink">{formatMoney(tier.unitPriceMinor)}</strong> {per}
                <span className="ml-1.5 text-xs font-semibold text-gold-700">
                  save {formatMoney(variant.effectivePriceMinor - tier.unitPriceMinor)} {per}
                </span>
              </span>
              {!reached ? (
                <button
                  type="button"
                  onClick={() => onChoose(tier.minQtyMilli)}
                  className="rounded-full border border-gold-400 bg-surface px-3 py-1 text-xs font-bold text-ink transition-colors hover:bg-gold-100"
                >
                  Choose {formatQuantity(tier.minQtyMilli, variant.unit)}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 border-t border-gold-300/70 pt-2.5 text-sm" aria-live="polite">
        {saving > 0 ? (
          <span className="font-semibold text-brand-800">
            Bulk price applied. You save {formatMoney(saving)} on {formatQuantity(quantity, variant.unit)}.
          </span>
        ) : next ? (
          <span className="text-ink-muted">
            Add {formatQuantity(next.minQtyMilli - quantity, variant.unit)} more to pay {formatMoney(next.unitPriceMinor)} {per}.
          </span>
        ) : null}
      </p>
    </div>
  );
}

function subscribeScroll(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  window.addEventListener("resize", onChange);
  return () => {
    window.removeEventListener("scroll", onChange);
    window.removeEventListener("resize", onChange);
  };
}

/**
 * True once the element has scrolled up and out of view. Reads the position
 * directly, so it is right even when the shopper scrolled before the page
 * finished loading.
 */
function useScrolledPast(ref: RefObject<HTMLElement | null>): boolean {
  return useSyncExternalStore(
    subscribeScroll,
    () => (ref.current ? ref.current.getBoundingClientRect().bottom < 0 : false),
    () => false,
  );
}

interface StickyBuyBarProps {
  show: boolean;
  productName: string;
  variant: VariantView;
  quantity: number;
  pending: boolean;
  added: boolean;
  onAdd: () => void;
}

/**
 * Phones only: keeps the price and add button within reach once the main add
 * button has scrolled away. Floating buttons move up while it shows.
 */
function StickyBuyBar({ show, productName, variant, quantity, pending, added, onAdd }: StickyBuyBarProps) {
  useEffect(() => {
    document.documentElement.toggleAttribute("data-buy-bar", show);
    return () => {
      document.documentElement.toggleAttribute("data-buy-bar", false);
    };
  }, [show]);
  const unitPrice = unitPriceForQuantity({ priceMinor: variant.priceMinor, salePriceMinor: variant.salePriceMinor, saleEndsAt: variant.saleEndsAt }, variant.tiers, quantity);
  return (
    <div
      aria-hidden={!show}
      inert={!show}
      className={cn(
        "fixed inset-x-0 bottom-[var(--nav-offset,0px)] z-30 border-t border-line bg-surface/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3 shadow-[0_-10px_30px_-12px_rgba(15,48,34,0.25)] backdrop-blur transition-transform duration-300 ease-out lg:hidden",
        show ? "translate-y-0" : "pointer-events-none translate-y-[calc(100%+var(--nav-offset,0px))]",
      )}
    >
      <div className="mx-auto flex max-w-xl items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{productName}</p>
          <p className="text-sm tabular-nums">
            <strong>{formatMoney(lineTotalMinor(unitPrice, quantity))}</strong>
            <span className="text-ink-muted"> · {formatQuantity(quantity, variant.unit)}</span>
          </p>
        </div>
        <Button size="lg" disabled={pending} onClick={onAdd} aria-label={`Add ${formatQuantity(quantity, variant.unit)} of ${productName} to cart`}>
          {pending ? <Spinner label="Adding" /> : added ? <Check className="pop" /> : <ShoppingBasket />}
          {added ? "Added" : "Add to cart"}
        </Button>
      </div>
    </div>
  );
}

interface ProductPurchaseProps {
  variants: VariantView[];
  productName: string;
  /** Lets shoppers ask to be told when an out-of-stock option returns. */
  stockAlert?: { smsEnabled: boolean };
  /** Show the phone add-to-cart bar once the main button scrolls away (product page only). */
  stickyBar?: boolean;
  /** Called after a successful add, e.g. to close a quick-view window. */
  onAdded?: () => void;
}

/** Variant picker + quantity stepper + add button for the product page. */
export function ProductPurchase({ variants, productName, stockAlert, stickyBar = false, onAdded }: ProductPurchaseProps) {
  const [variantId, setVariantId] = useState(variants[0]?.id ?? "");
  const variant = variants.find((v) => v.id === variantId) ?? variants[0];
  const [quantity, setQuantity] = useState(variant?.minQtyMilli ?? 1000);
  const { pending, add } = useAddToCart();
  const [added, flash] = useAddedFlash();
  const afterAdd = () => {
    flash();
    onAdded?.();
  };
  const buyRow = useRef<HTMLDivElement>(null);
  const scrolledPast = useScrolledPast(buyRow);

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
                  "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-200 active:scale-95 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500",
                  v.id === variant.id
                    ? "border-brand-700 bg-brand-50 text-brand-800 shadow-[inset_0_0_0_1px_var(--color-brand-700)]"
                    : "border-line-strong bg-surface text-ink hover:border-brand-400 hover:bg-brand-50/50 motion-safe:hover:-translate-y-0.5",
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
                {v.id === variant.id ? <Check className="pop h-3.5 w-3.5" aria-hidden="true" /> : null}
                {v.name}
                {!v.inStock ? <span className="sr-only"> (out of stock)</span> : null}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {variant.inStock ? <BulkPricing variant={variant} quantity={quantity} onChoose={setQuantity} /> : null}

      {variant.inStock ? (
        <div ref={buyRow} className="flex flex-wrap items-center gap-3">
          <QuantityStepper
            value={quantity}
            onChange={setQuantity}
            stepMilli={variant.stepMilli}
            minMilli={variant.minQtyMilli}
            maxMilli={maxSelectable(variant)}
            unit={variant.unit}
            label={`Quantity of ${productName}`}
          />
          <Button size="lg" className="min-w-48 flex-1 sm:flex-none" disabled={pending} onClick={() => add(variant.id, quantity, productName, afterAdd)}>
            {pending ? <Spinner label="Adding" /> : added ? <Check className="pop" /> : <ShoppingBasket />}
            {added ? "Added to cart" : "Add to cart"}
          </Button>
        </div>
      ) : (
        <>
          <div className="rounded-md border border-line bg-soft px-4 py-3 text-sm text-ink-muted" role="status">
            <strong className="text-ink">Currently unavailable.</strong> This option is out of stock and cannot be purchased
            right now. Please check back soon{variants.length > 1 ? " or choose another option" : ""}.
            {stockAlert ? (
              <StockAlertForm
                key={variant.id}
                variantId={variant.id}
                productName={productName}
                smsEnabled={stockAlert.smsEnabled}
              />
            ) : null}
          </div>
        </>
      )}
      {variant.inStock && variant.lowStock ? (
        <p className="text-sm font-medium text-warning">Only {formatQuantity(variant.availableMilli, variant.unit)} left in stock.</p>
      ) : null}
      {stickyBar && variant.inStock ? (
        <StickyBuyBar
          show={scrolledPast}
          productName={productName}
          variant={variant}
          quantity={quantity}
          pending={pending}
          added={added}
          onAdd={() => add(variant.id, quantity, productName, afterAdd)}
        />
      ) : null}
    </div>
  );
}
