import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { effectiveUnitPrice, evaluateCoupon, priceLines, sumLines, unitPriceForQuantity, type PricedLine } from "@/lib/pricing";
import { checkQuantity, clampToValidQuantity, lineTotalMinor, type SellingUnitCode } from "@/lib/quantity";
import { countCustomerRedemptions, loadCoupon } from "@/server/coupons";
import { getCurrentUser } from "@/server/session";

export const CART_COOKIE = "bg_cart";
const CART_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export const cartItemInclude = {
  variant: {
    include: {
      priceTiers: true,
      product: {
        include: {
          category: { select: { id: true, name: true, isActive: true } },
          images: { orderBy: { sortOrder: "asc" }, take: 1 },
        },
      },
    },
  },
} satisfies Prisma.CartItemInclude;

type CartItemRow = Prisma.CartItemGetPayload<{ include: typeof cartItemInclude }>;

export type CartIssue =
  | { kind: "PRICE_CHANGED"; previousMinor: number; currentMinor: number }
  | { kind: "UNAVAILABLE" }
  | { kind: "INSUFFICIENT_STOCK"; availableMilli: number };

export interface CartLineView {
  itemId: string;
  variantId: string;
  productId: string;
  categoryId: string;
  productName: string;
  productSlug: string;
  variantName: string;
  sku: string;
  unit: SellingUnitCode;
  imageUrl: string | null;
  imageAlt: string;
  unitPriceMinor: number;
  regularPriceMinor: number;
  /** True when a bulk price is lowering the unit price for this quantity. */
  bulkPriceApplied: boolean;
  quantityMilli: number;
  lineTotalMinor: number;
  stepMilli: number;
  minQtyMilli: number;
  maxQtyMilli: number | null;
  availableMilli: number;
  issues: CartIssue[];
  /** False when the line cannot be checked out as-is. */
  purchasable: boolean;
}

export interface CartView {
  id: string | null;
  lines: CartLineView[];
  itemCount: number;
  subtotalMinor: number;
  couponCode: string | null;
  couponDiscountMinor: number;
  couponMessage: string | null;
  hasBlockingIssues: boolean;
  hasPriceChanges: boolean;
}

export const EMPTY_CART: CartView = {
  id: null,
  lines: [],
  itemCount: 0,
  subtotalMinor: 0,
  couponCode: null,
  couponDiscountMinor: 0,
  couponMessage: null,
  hasBlockingIssues: false,
  hasPriceChanges: false,
};

function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Revalidates stored cart items against live catalogue data. */
export function buildLineView(item: CartItemRow): CartLineView {
  const variant = item.variant;
  const product = variant.product;
  const unit = variant.unit as SellingUnitCode;
  const listPrice = effectiveUnitPrice(variant);
  const currentPrice = unitPriceForQuantity(variant, variant.priceTiers, item.quantityMilli);
  const rules = { stepMilli: variant.stepMilli, minQtyMilli: variant.minQtyMilli, maxQtyMilli: variant.maxQtyMilli };
  const availableMilli = clampToValidQuantity(variant.stockMilli, rules) ?? 0;
  const issues: CartIssue[] = [];

  const sellable = variant.isActive && product.status === "PUBLISHED" && product.category.isActive;
  if (!sellable) {
    issues.push({ kind: "UNAVAILABLE" });
  } else {
    const check = checkQuantity(item.quantityMilli, rules, unit, variant.stockMilli);
    if (!check.ok) issues.push({ kind: "INSUFFICIENT_STOCK", availableMilli });
  }
  if (item.seenUnitPriceMinor !== currentPrice) {
    issues.push({ kind: "PRICE_CHANGED", previousMinor: item.seenUnitPriceMinor, currentMinor: currentPrice });
  }

  const image = product.images[0];
  return {
    itemId: item.id,
    variantId: variant.id,
    productId: product.id,
    categoryId: product.categoryId,
    productName: product.name,
    productSlug: product.slug,
    variantName: variant.name,
    sku: variant.sku,
    unit,
    imageUrl: image?.url ?? null,
    imageAlt: image?.alt ?? product.name,
    unitPriceMinor: currentPrice,
    regularPriceMinor: variant.priceMinor,
    bulkPriceApplied: currentPrice < listPrice,
    quantityMilli: item.quantityMilli,
    lineTotalMinor: lineTotalMinor(currentPrice, item.quantityMilli),
    stepMilli: variant.stepMilli,
    minQtyMilli: variant.minQtyMilli,
    maxQtyMilli: variant.maxQtyMilli,
    availableMilli,
    issues,
    purchasable: !issues.some((i) => i.kind === "UNAVAILABLE" || i.kind === "INSUFFICIENT_STOCK"),
  };
}

export function toPricedLines(lines: readonly CartLineView[]): PricedLine[] {
  return priceLines(
    lines
      .filter((l) => l.purchasable)
      .map((l) => ({
        variantId: l.variantId,
        productId: l.productId,
        categoryId: l.categoryId,
        unitPriceMinor: l.unitPriceMinor,
        quantityMilli: l.quantityMilli,
      })),
  );
}

export async function findCart(): Promise<{ id: string; couponCode: string | null } | null> {
  const user = await getCurrentUser();
  if (user) {
    return prisma.cart.findUnique({ where: { userId: user.id }, select: { id: true, couponCode: true } });
  }
  const token = (await cookies()).get(CART_COOKIE)?.value;
  if (!token) return null;
  return prisma.cart.findFirst({ where: { token, userId: null }, select: { id: true, couponCode: true } });
}

/** Read-only cart for rendering (safe in Server Components). */
export const getCartView = cache(async (): Promise<CartView> => {
  const cart = await findCart();
  if (!cart) return EMPTY_CART;
  const items = await prisma.cartItem.findMany({
    where: { cartId: cart.id },
    include: cartItemInclude,
    orderBy: { createdAt: "asc" },
  });
  const lines = items.map(buildLineView);
  const priced = toPricedLines(lines);
  const subtotal = sumLines(priced);

  let couponDiscount = 0;
  let couponMessage: string | null = null;
  if (cart.couponCode) {
    const loaded = await loadCoupon(cart.couponCode);
    if (!loaded) {
      couponMessage = "This coupon is no longer available.";
    } else {
      const user = await getCurrentUser();
      const used = user ? await countCustomerRedemptions(loaded.coupon.id, { userId: user.id, email: user.email }) : 0;
      const result = evaluateCoupon(loaded.rule, priced, new Date(), used);
      if (result.ok) couponDiscount = result.discountMinor;
      else couponMessage = result.message;
    }
  }

  return {
    id: cart.id,
    lines,
    itemCount: lines.length,
    subtotalMinor: subtotal,
    couponCode: cart.couponCode,
    couponDiscountMinor: couponDiscount,
    couponMessage,
    hasBlockingIssues: lines.some((l) => !l.purchasable),
    hasPriceChanges: lines.some((l) => l.issues.some((i) => i.kind === "PRICE_CHANGED")),
  };
});

/** Number of lines for the header badge. */
export async function getCartCount(): Promise<number> {
  const cart = await findCart();
  if (!cart) return 0;
  return prisma.cartItem.count({ where: { cartId: cart.id } });
}

/**
 * Returns the current cart id, creating the cart (and guest cookie) when
 * needed. Only call from Server Actions / Route Handlers (sets cookies).
 */
export async function ensureCart(): Promise<string> {
  const user = await getCurrentUser();
  if (user) {
    const cart = await prisma.cart.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id, token: newToken() },
      select: { id: true },
    });
    return cart.id;
  }
  const store = await cookies();
  const token = store.get(CART_COOKIE)?.value;
  if (token) {
    const existing = await prisma.cart.findFirst({ where: { token, userId: null }, select: { id: true } });
    if (existing) return existing.id;
  }
  const fresh = newToken();
  const cart = await prisma.cart.create({ data: { token: fresh }, select: { id: true } });
  store.set(CART_COOKIE, fresh, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CART_COOKIE_MAX_AGE,
  });
  return cart.id;
}

/**
 * Moves a guest cart into the signed-in customer's cart. Quantities are
 * combined and capped at what is valid and in stock. Clears the guest cookie.
 */
export async function mergeGuestCart(userId: string): Promise<void> {
  const store = await cookies();
  const token = store.get(CART_COOKIE)?.value;
  if (!token) return;
  const guest = await prisma.cart.findFirst({
    where: { token, userId: null },
    include: { items: { include: { variant: { include: { priceTiers: true } } } } },
  });
  store.delete(CART_COOKIE);
  if (!guest) return;

  await prisma.$transaction(async (tx) => {
    const target = await tx.cart.upsert({
      where: { userId },
      update: {},
      create: { userId, token: newToken() },
      include: { items: true },
    });
    for (const item of guest.items) {
      const existing = target.items.find((i) => i.variantId === item.variantId);
      const rules = { stepMilli: item.variant.stepMilli, minQtyMilli: item.variant.minQtyMilli, maxQtyMilli: item.variant.maxQtyMilli };
      const desired = (existing?.quantityMilli ?? 0) + item.quantityMilli;
      const capped = clampToValidQuantity(Math.min(desired, Math.max(item.variant.stockMilli, rules.minQtyMilli)), rules);
      if (!capped) continue;
      // Combining carts can reach a bulk price; only a price increase should be flagged.
      const price = unitPriceForQuantity(item.variant, item.variant.priceTiers, capped);
      const seen = Math.min(item.seenUnitPriceMinor, existing?.seenUnitPriceMinor ?? Number.MAX_SAFE_INTEGER);
      const seenUnitPriceMinor = price <= seen ? price : seen;
      if (existing) {
        await tx.cartItem.update({ where: { id: existing.id }, data: { quantityMilli: capped, seenUnitPriceMinor } });
      } else {
        await tx.cartItem.create({
          data: { cartId: target.id, variantId: item.variantId, quantityMilli: capped, seenUnitPriceMinor },
        });
      }
    }
    if (!target.couponCode && guest.couponCode) {
      await tx.cart.update({ where: { id: target.id }, data: { couponCode: guest.couponCode } });
    }
    await tx.cart.delete({ where: { id: guest.id } });
  });
}
