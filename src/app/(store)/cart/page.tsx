import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ShieldCheck, ShoppingBasket } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { AcceptPricesButton, CartLineControls, CouponForm } from "@/components/store/cart-controls";
import { PageHeader } from "@/components/store/page-header";
import { formatMoney } from "@/lib/money";
import { formatQuantity, UNIT_INFO } from "@/lib/quantity";
import { cn } from "@/lib/utils";
import { getCartView } from "@/server/cart";

export const metadata: Metadata = {
  title: "Your cart",
  robots: { index: false, follow: false },
};

export default async function CartPage() {
  const cart = await getCartView();

  if (cart.lines.length === 0) {
    return (
      <>
        <PageHeader title="Your cart" crumbs={[{ href: "/", label: "Home" }, { label: "Cart" }]} />
        <div className="container-page">
          <div className="rounded-lg border border-line bg-surface">
            <EmptyState
              icon={<ShoppingBasket />}
              title="Your cart is empty"
              description="Browse rice, cooking oil, juices, snacks and household essentials, then add them to your cart."
              action={
                <Link href="/shop" className={buttonVariants({ size: "lg" })}>
                  Continue shopping <ArrowRight aria-hidden="true" />
                </Link>
              }
            />
          </div>
        </div>
      </>
    );
  }

  const priceChanges = cart.lines.flatMap((line) =>
    line.issues.flatMap((issue) => (issue.kind === "PRICE_CHANGED" ? [{ line, issue }] : [])),
  );
  const estimatedTotal = cart.subtotalMinor - cart.couponDiscountMinor;

  return (
    <>
      <PageHeader
        title="Your cart"
        description={`${cart.itemCount} ${cart.itemCount === 1 ? "item" : "items"}`}
        crumbs={[{ href: "/", label: "Home" }, { label: "Cart" }]}
      />
      <div className="container-page grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          {priceChanges.length > 0 ? (
            <Alert tone="warning" title="Some prices have changed since you added these items">
              <ul className="mt-1 space-y-0.5">
                {priceChanges.map(({ line, issue }) => (
                  <li key={line.itemId}>
                    {line.productName} ({line.variantName}): {formatMoney(issue.previousMinor)} → <strong>{formatMoney(issue.currentMinor)}</strong>
                  </li>
                ))}
              </ul>
              <p className="mt-2">Your cart total uses the current prices. You will always see the final amount before paying.</p>
              <div className="mt-3">
                <AcceptPricesButton />
              </div>
            </Alert>
          ) : null}
          {cart.hasBlockingIssues ? (
            <Alert tone="danger" title="Some items need your attention">
              Remove unavailable items or reduce quantities to what is in stock before checking out.
            </Alert>
          ) : null}

          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {cart.lines.map((line) => {
              const unavailable = line.issues.some((i) => i.kind === "UNAVAILABLE");
              const stockIssue = line.issues.find((i) => i.kind === "INSUFFICIENT_STOCK");
              return (
                <li key={line.itemId} className={cn("flex gap-4 p-4 sm:p-5", !line.purchasable && "bg-danger-soft/40")}>
                  <Link href={`/products/${line.productSlug}`} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md bg-soft sm:h-24 sm:w-24">
                    {line.imageUrl ? <Image src={line.imageUrl} alt={line.imageAlt} fill sizes="96px" className="object-cover" /> : null}
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <Link href={`/products/${line.productSlug}`} className="font-semibold text-ink hover:text-brand-700">
                        {line.productName}
                      </Link>
                      <p className="text-sm text-ink-muted">{line.variantName}</p>
                      <p className="mt-1 text-sm text-ink-muted tabular-nums">
                        {formatMoney(line.unitPriceMinor)} {UNIT_INFO[line.unit].per}
                        {line.unitPriceMinor < line.regularPriceMinor ? (
                          <span className="ml-1.5 text-xs text-ink-subtle line-through">{formatMoney(line.regularPriceMinor)}</span>
                        ) : null}
                      </p>
                      {unavailable ? (
                        <p className="mt-1 text-sm font-medium text-danger">⚠ No longer available. Please remove it.</p>
                      ) : stockIssue && stockIssue.kind === "INSUFFICIENT_STOCK" ? (
                        <p className="mt-1 text-sm font-medium text-danger">
                          ⚠ {stockIssue.availableMilli > 0 ? `Only ${formatQuantity(stockIssue.availableMilli, line.unit)} available.` : "Out of stock."}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-row-reverse items-center justify-between gap-3 sm:flex-col sm:items-end">
                      <p className="font-display text-base font-bold tabular-nums">{formatMoney(line.lineTotalMinor)}</p>
                      <CartLineControls
                        itemId={line.itemId}
                        productName={line.productName}
                        quantityMilli={line.quantityMilli}
                        stepMilli={line.stepMilli}
                        minQtyMilli={line.minQtyMilli}
                        maxMilli={Math.min(line.availableMilli, line.maxQtyMilli ?? Number.MAX_SAFE_INTEGER)}
                        unit={line.unit}
                        purchasable={line.purchasable}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <Link href="/shop" className="inline-flex text-sm font-semibold text-brand-700 hover:underline">
            ← Continue shopping
          </Link>
        </div>

        <aside aria-labelledby="summary-title" className="h-fit space-y-5 rounded-lg border border-line bg-surface p-5 lg:sticky lg:top-32">
          <h2 id="summary-title" className="text-lg font-extrabold">
            Order summary
          </h2>
          <CouponForm appliedCode={cart.couponCode} message={cart.couponMessage} />
          <dl className="space-y-2.5 border-t border-line pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-muted">Subtotal</dt>
              <dd className="tabular-nums">{formatMoney(cart.subtotalMinor)}</dd>
            </div>
            {cart.couponDiscountMinor > 0 ? (
              <div className="flex justify-between text-success">
                <dt>Coupon discount</dt>
                <dd className="tabular-nums">−{formatMoney(cart.couponDiscountMinor)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between">
              <dt className="text-ink-muted">Delivery</dt>
              <dd className="text-ink-muted">Calculated at checkout</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-3 text-base font-bold">
              <dt>Estimated total</dt>
              <dd className="tabular-nums">{formatMoney(estimatedTotal)}</dd>
            </div>
          </dl>
          {cart.hasBlockingIssues ? (
            <span className={buttonVariants({ size: "lg", className: "w-full opacity-55" })} aria-disabled="true">
              Resolve cart issues to check out
            </span>
          ) : (
            <Link href="/checkout" className={buttonVariants({ size: "lg", className: "w-full" })}>
              Proceed to checkout <ArrowRight aria-hidden="true" />
            </Link>
          )}
          <p className="flex items-center justify-center gap-1.5 text-xs text-ink-muted">
            <ShieldCheck className="h-4 w-4 text-leaf-600" aria-hidden="true" /> Totals are confirmed securely at checkout.
          </p>
        </aside>
      </div>
    </>
  );
}
