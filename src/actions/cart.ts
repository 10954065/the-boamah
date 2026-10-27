"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { evaluateCoupon, unitPriceForQuantity } from "@/lib/pricing";
import { checkQuantity, clampToValidQuantity, type SellingUnitCode } from "@/lib/quantity";
import { ensureCart, getCartView, toPricedLines } from "@/server/cart";
import { countCustomerRedemptions, loadCoupon, normalizeCouponCode } from "@/server/coupons";
import { authorizeCustomer, getCurrentUser, runAction } from "@/server/session";

const idSchema = z.string().min(1).max(64);
const quantitySchema = z.number().int().positive().max(1_000_000);

function refresh(): void {
  revalidatePath("/", "layout");
}

async function loadSellableVariant(variantId: string) {
  return prisma.productVariant.findFirst({
    where: {
      id: variantId,
      isActive: true,
      product: { status: "PUBLISHED", category: { isActive: true } },
    },
    include: { product: { select: { name: true } }, priceTiers: true },
  });
}

export async function addToCart(input: { variantId: string; quantityMilli: number }): Promise<ActionResult<{ count: number }>> {
  return runAction("cart.add", async () => {
    const parsed = z.object({ variantId: idSchema, quantityMilli: quantitySchema }).safeParse(input);
    if (!parsed.success) return fail("Please choose a valid quantity.");

    const variant = await loadSellableVariant(parsed.data.variantId);
    if (!variant) return fail("This product is not available right now.");

    const cartId = await ensureCart();
    const existing = await prisma.cartItem.findUnique({
      where: { cartId_variantId: { cartId, variantId: variant.id } },
    });
    const total = (existing?.quantityMilli ?? 0) + parsed.data.quantityMilli;
    const rules = { stepMilli: variant.stepMilli, minQtyMilli: variant.minQtyMilli, maxQtyMilli: variant.maxQtyMilli };
    const check = checkQuantity(total, rules, variant.unit as SellingUnitCode, variant.stockMilli);
    if (!check.ok) {
      return fail(existing ? `${check.message} You already have some in your cart.` : check.message);
    }

    const price = unitPriceForQuantity(variant, variant.priceTiers, total);
    await prisma.cartItem.upsert({
      where: { cartId_variantId: { cartId, variantId: variant.id } },
      update: { quantityMilli: total, seenUnitPriceMinor: price },
      create: { cartId, variantId: variant.id, quantityMilli: total, seenUnitPriceMinor: price },
    });
    await prisma.cart.update({ where: { id: cartId }, data: { updatedAt: new Date() } });
    const count = await prisma.cartItem.count({ where: { cartId } });
    refresh();
    return ok({ count }, `${variant.product.name} added to your cart.`);
  });
}

export interface CartDrawerLine {
  itemId: string;
  productName: string;
  productSlug: string;
  variantName: string;
  unit: SellingUnitCode;
  imageUrl: string | null;
  imageAlt: string;
  quantityMilli: number;
  lineTotalMinor: number;
  stepMilli: number;
  minQtyMilli: number;
  maxMilli: number;
  purchasable: boolean;
  bulkPriceApplied: boolean;
}

export interface CartDrawerSummary {
  lines: CartDrawerLine[];
  subtotalMinor: number;
  couponDiscountMinor: number;
  hasBlockingIssues: boolean;
}

/** Current cart for the slide-out cart panel, revalidated against live prices and stock. */
export async function getCartDrawer(): Promise<ActionResult<CartDrawerSummary>> {
  return runAction("cart.drawer", async () => {
    const cart = await getCartView();
    return ok({
      lines: cart.lines.map((line) => ({
        itemId: line.itemId,
        productName: line.productName,
        productSlug: line.productSlug,
        variantName: line.variantName,
        unit: line.unit,
        imageUrl: line.imageUrl,
        imageAlt: line.imageAlt,
        quantityMilli: line.quantityMilli,
        lineTotalMinor: line.lineTotalMinor,
        stepMilli: line.stepMilli,
        minQtyMilli: line.minQtyMilli,
        maxMilli: Math.min(line.availableMilli, line.maxQtyMilli ?? Number.MAX_SAFE_INTEGER),
        purchasable: line.purchasable,
        bulkPriceApplied: line.bulkPriceApplied,
      })),
      subtotalMinor: cart.subtotalMinor,
      couponDiscountMinor: cart.couponDiscountMinor,
      hasBlockingIssues: cart.hasBlockingIssues,
    });
  });
}

export interface BuyAgainSummary {
  added: number;
  reduced: number;
  unavailable: number;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/**
 * Puts the lines of one of the customer's past orders back in their cart at
 * today's prices, capped at what is in stock. Lines no longer sold are skipped.
 */
export async function buyAgain(input: { reference: string }): Promise<ActionResult<BuyAgainSummary>> {
  return runAction("cart.buyAgain", async () => {
    const user = await authorizeCustomer();
    const reference = z.string().trim().min(3).max(40).safeParse(input.reference);
    if (!reference.success) return fail("Order not found.");
    const order = await prisma.order.findFirst({
      where: { reference: reference.data, userId: user.id },
      select: { items: { select: { variantId: true, quantityMilli: true } } },
    });
    if (!order) return fail("Order not found.");

    const cartId = await ensureCart();
    const summary: BuyAgainSummary = { added: 0, reduced: 0, unavailable: 0 };
    for (const item of order.items) {
      const variant = item.variantId ? await loadSellableVariant(item.variantId) : null;
      if (!variant) {
        summary.unavailable += 1;
        continue;
      }
      const existing = await prisma.cartItem.findUnique({ where: { cartId_variantId: { cartId, variantId: variant.id } } });
      const already = existing?.quantityMilli ?? 0;
      const wanted = already + item.quantityMilli;
      const rules = { stepMilli: variant.stepMilli, minQtyMilli: variant.minQtyMilli, maxQtyMilli: variant.maxQtyMilli };
      const quantity = clampToValidQuantity(Math.min(wanted, variant.stockMilli), rules);
      if (quantity === null || quantity <= already) {
        summary.unavailable += 1;
        continue;
      }
      const price = unitPriceForQuantity(variant, variant.priceTiers, quantity);
      await prisma.cartItem.upsert({
        where: { cartId_variantId: { cartId, variantId: variant.id } },
        update: { quantityMilli: quantity, seenUnitPriceMinor: price },
        create: { cartId, variantId: variant.id, quantityMilli: quantity, seenUnitPriceMinor: price },
      });
      summary.added += 1;
      if (quantity < wanted) summary.reduced += 1;
    }

    if (summary.added === 0) {
      return fail("None of the items from this order are available right now.");
    }
    await prisma.cart.update({ where: { id: cartId }, data: { updatedAt: new Date() } });
    refresh();
    const notes = [
      summary.reduced ? `${plural(summary.reduced, "item")} reduced to what is in stock.` : "",
      summary.unavailable ? `${plural(summary.unavailable, "item")} not available right now.` : "",
    ].filter(Boolean);
    return ok(summary, [`${plural(summary.added, "item")} added to your cart.`, ...notes].join(" "));
  });
}

export async function updateCartItem(input: { itemId: string; quantityMilli: number }): Promise<ActionResult> {
  return runAction("cart.update", async () => {
    const parsed = z.object({ itemId: idSchema, quantityMilli: quantitySchema }).safeParse(input);
    if (!parsed.success) return fail("Please choose a valid quantity.");
    const cartId = await ensureCart();
    const item = await prisma.cartItem.findFirst({
      where: { id: parsed.data.itemId, cartId },
      include: { variant: { include: { priceTiers: true } } },
    });
    if (!item) return fail("That item is no longer in your cart.");

    const { variant } = item;
    const rules = { stepMilli: variant.stepMilli, minQtyMilli: variant.minQtyMilli, maxQtyMilli: variant.maxQtyMilli };
    const check = checkQuantity(parsed.data.quantityMilli, rules, variant.unit as SellingUnitCode, variant.stockMilli);
    if (!check.ok) return fail(check.message);

    // The shopper sees the new line price when they change the quantity, including any bulk price.
    const price = unitPriceForQuantity(variant, variant.priceTiers, parsed.data.quantityMilli);
    await prisma.cartItem.update({ where: { id: item.id }, data: { quantityMilli: parsed.data.quantityMilli, seenUnitPriceMinor: price } });
    refresh();
    return ok(undefined);
  });
}

export async function removeCartItem(input: { itemId: string }): Promise<ActionResult> {
  return runAction("cart.remove", async () => {
    const parsed = z.object({ itemId: idSchema }).safeParse(input);
    if (!parsed.success) return fail("Invalid item.");
    const cartId = await ensureCart();
    await prisma.cartItem.deleteMany({ where: { id: parsed.data.itemId, cartId } });
    refresh();
    return ok(undefined, "Item removed.");
  });
}

/** Customer confirms they have seen updated prices. */
export async function acceptCartPrices(): Promise<ActionResult> {
  return runAction("cart.acceptPrices", async () => {
    const cartId = await ensureCart();
    const items = await prisma.cartItem.findMany({ where: { cartId }, include: { variant: { include: { priceTiers: true } } } });
    await prisma.$transaction(
      items.map((item) =>
        prisma.cartItem.update({
          where: { id: item.id },
          data: { seenUnitPriceMinor: unitPriceForQuantity(item.variant, item.variant.priceTiers, item.quantityMilli) },
        }),
      ),
    );
    refresh();
    return ok(undefined);
  });
}

export async function applyCoupon(input: { code: string }): Promise<ActionResult> {
  return runAction("cart.applyCoupon", async () => {
    const parsed = z.object({ code: z.string().trim().min(2).max(40) }).safeParse(input);
    if (!parsed.success) return fail("Please enter a coupon code.");
    const loaded = await loadCoupon(parsed.data.code);
    if (!loaded) return fail("That coupon code is not valid.");

    const cart = await getCartView();
    const user = await getCurrentUser();
    const used = user ? await countCustomerRedemptions(loaded.coupon.id, { userId: user.id, email: user.email }) : 0;
    const result = evaluateCoupon(loaded.rule, toPricedLines(cart.lines), new Date(), used);
    if (!result.ok) return fail(result.message);

    const cartId = await ensureCart();
    await prisma.cart.update({ where: { id: cartId }, data: { couponCode: normalizeCouponCode(parsed.data.code) } });
    refresh();
    return ok(undefined, "Coupon applied.");
  });
}

export async function removeCoupon(): Promise<ActionResult> {
  return runAction("cart.removeCoupon", async () => {
    const cartId = await ensureCart();
    await prisma.cart.update({ where: { id: cartId }, data: { couponCode: null } });
    refresh();
    return ok(undefined);
  });
}
