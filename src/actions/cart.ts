"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { effectiveUnitPrice, evaluateCoupon } from "@/lib/pricing";
import { checkQuantity, type SellingUnitCode } from "@/lib/quantity";
import { ensureCart, getCartView, toPricedLines } from "@/server/cart";
import { countCustomerRedemptions, loadCoupon, normalizeCouponCode } from "@/server/coupons";
import { getCurrentUser, runAction } from "@/server/session";

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
    include: { product: { select: { name: true } } },
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

    const price = effectiveUnitPrice(variant);
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

export async function updateCartItem(input: { itemId: string; quantityMilli: number }): Promise<ActionResult> {
  return runAction("cart.update", async () => {
    const parsed = z.object({ itemId: idSchema, quantityMilli: quantitySchema }).safeParse(input);
    if (!parsed.success) return fail("Please choose a valid quantity.");
    const cartId = await ensureCart();
    const item = await prisma.cartItem.findFirst({ where: { id: parsed.data.itemId, cartId }, include: { variant: true } });
    if (!item) return fail("That item is no longer in your cart.");

    const { variant } = item;
    const rules = { stepMilli: variant.stepMilli, minQtyMilli: variant.minQtyMilli, maxQtyMilli: variant.maxQtyMilli };
    const check = checkQuantity(parsed.data.quantityMilli, rules, variant.unit as SellingUnitCode, variant.stockMilli);
    if (!check.ok) return fail(check.message);

    await prisma.cartItem.update({ where: { id: item.id }, data: { quantityMilli: parsed.data.quantityMilli } });
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
    const items = await prisma.cartItem.findMany({ where: { cartId }, include: { variant: true } });
    await prisma.$transaction(
      items.map((item) =>
        prisma.cartItem.update({ where: { id: item.id }, data: { seenUnitPriceMinor: effectiveUnitPrice(item.variant) } }),
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
