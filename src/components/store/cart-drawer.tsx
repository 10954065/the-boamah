"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CheckCircle2, ShoppingBasket } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { getCartDrawer, type CartDrawerSummary } from "@/actions/cart";
import { buttonVariants } from "@/components/ui/button";
import { Dialog, SheetContent } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/feedback";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { CartLineControls } from "./cart-controls";
import { FreeDeliveryBar } from "./free-delivery-bar";
import { PaymentBadges, type PaymentOptions } from "./payment-badges";

interface CartDrawerApi {
  /** Opens the cart panel; `notice` confirms what just happened, e.g. an item added. */
  openCart: (notice?: string) => void;
}

const CartDrawerContext = createContext<CartDrawerApi | null>(null);

/** Falls back to the cart page when used outside the provider. */
export function useCartDrawer(): CartDrawerApi {
  return useContext(CartDrawerContext) ?? { openCart: () => window.location.assign("/cart") };
}

/** Slide-out cart available on every store page. */
export function CartDrawerProvider({ children, payment }: { children: ReactNode; payment: PaymentOptions }) {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [summary, setSummary] = useState<CartDrawerSummary | null>(null);
  const [, startLoading] = useTransition();
  // Dims the list only while an edit made in the panel is being confirmed.
  const [updating, startUpdating] = useTransition();

  const fetchSummary = useCallback(async () => {
    const result = await getCartDrawer();
    if (result.ok) setSummary(result.data);
    else toast.error(result.error);
  }, []);
  const reload = useCallback(() => startLoading(fetchSummary), [fetchSummary]);
  const refresh = useCallback(() => startUpdating(fetchSummary), [fetchSummary]);

  const api = useMemo<CartDrawerApi>(
    () => ({
      openCart: (message) => {
        setNotice(message ?? null);
        setOpen(true);
        reload();
      },
    }),
    [reload],
  );

  const close = () => setOpen(false);
  const lines = summary?.lines ?? [];
  const total = summary ? summary.subtotalMinor - summary.couponDiscountMinor : 0;

  return (
    <CartDrawerContext.Provider value={api}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          title={summary ? `Your cart (${lines.length})` : "Your cart"}
          closeLabel="Close cart"
          className="max-w-md"
          footer={
            lines.length > 0 && summary ? (
              <div className="space-y-3">
                {summary.freeDelivery ? <FreeDeliveryBar goodsTotalMinor={total} target={summary.freeDelivery} /> : null}
                <dl className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-ink-muted">Subtotal</dt>
                    <dd className="tabular-nums">{formatMoney(summary.subtotalMinor)}</dd>
                  </div>
                  {summary.couponDiscountMinor > 0 ? (
                    <div className="flex justify-between text-success">
                      <dt>Coupon discount</dt>
                      <dd className="tabular-nums">−{formatMoney(summary.couponDiscountMinor)}</dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between text-base font-bold">
                    <dt>Total before delivery</dt>
                    <dd className="tabular-nums">{formatMoney(total)}</dd>
                  </div>
                </dl>
                <div className="grid grid-cols-2 gap-2">
                  <Link href="/cart" onClick={close} className={buttonVariants({ variant: "outline", size: "lg" })}>
                    View cart
                  </Link>
                  {summary.hasBlockingIssues ? (
                    <Link href="/cart" onClick={close} className={buttonVariants({ size: "lg" })}>
                      Review items
                    </Link>
                  ) : (
                    <Link href="/checkout" onClick={close} className={buttonVariants({ size: "lg" })}>
                      Checkout <ArrowRight aria-hidden="true" />
                    </Link>
                  )}
                </div>
                <PaymentBadges {...payment} label="Pay with" className="justify-center" />
              </div>
            ) : null
          }
        >
          {notice ? (
            <p role="status" className="pop mx-4 mt-4 flex items-start gap-2 rounded-lg bg-brand-50 px-3 py-2.5 text-sm font-semibold text-brand-800">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {notice}
            </p>
          ) : null}

          {!summary ? (
            <div className="flex justify-center py-16">
              <Spinner label="Loading your cart" />
            </div>
          ) : lines.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-16 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-soft text-brand-700">
                <ShoppingBasket className="h-6 w-6" aria-hidden="true" />
              </span>
              <p className="mt-4 font-semibold">Your cart is empty</p>
              <p className="mt-1 text-sm text-ink-muted">Rice, oil, juices, snacks and more are a tap away.</p>
              <Link href="/shop" onClick={close} className={cn(buttonVariants(), "mt-5")}>
                Start shopping
              </Link>
            </div>
          ) : (
            <ul className={cn("divide-y divide-line px-4 transition-opacity", updating && "opacity-60")} aria-busy={updating}>
              {lines.map((line) => (
                <li key={line.itemId} className="flex gap-3 py-4">
                  <Link
                    href={`/products/${line.productSlug}`}
                    onClick={close}
                    tabIndex={-1}
                    aria-hidden="true"
                    className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-soft"
                  >
                    {line.imageUrl ? <Image src={line.imageUrl} alt="" fill sizes="64px" className="object-cover" /> : null}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/products/${line.productSlug}`} onClick={close} className="line-clamp-2 text-sm font-semibold text-ink hover:text-brand-700">
                        {line.productName}
                      </Link>
                      <p className="shrink-0 text-sm font-bold tabular-nums">{formatMoney(line.lineTotalMinor)}</p>
                    </div>
                    <p className="text-xs text-ink-muted">
                      {line.variantName}
                      {line.bulkPriceApplied ? <span className="ml-1.5 font-bold text-gold-700">Bulk price</span> : null}
                    </p>
                    {!line.purchasable ? <p className="mt-1 text-xs font-medium text-danger">Not available in this quantity. Review it in your cart.</p> : null}
                    <div className="mt-2">
                      <CartLineControls
                        key={`${line.itemId}-${line.quantityMilli}`}
                        itemId={line.itemId}
                        productName={line.productName}
                        quantityMilli={line.quantityMilli}
                        stepMilli={line.stepMilli}
                        minQtyMilli={line.minQtyMilli}
                        maxMilli={line.maxMilli}
                        unit={line.unit}
                        purchasable={line.purchasable}
                        onChanged={refresh}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SheetContent>
      </Dialog>
    </CartDrawerContext.Provider>
  );
}

interface CartLinkProps {
  count: number;
  className?: string;
  children: ReactNode;
}

/** The header cart button: opens the panel, but still works as a link to /cart (new tab, no JavaScript). */
export function CartLink({ count, className, children }: CartLinkProps) {
  const { openCart } = useCartDrawer();
  return (
    <Link
      href="/cart"
      className={className}
      aria-label={`Cart, ${count} ${count === 1 ? "item" : "items"}`}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        openCart();
      }}
    >
      {children}
    </Link>
  );
}
