import "server-only";
import { z } from "zod";
import { Prisma, type StoreSettings } from "@/generated/prisma/client";
import { prisma, type Tx } from "@/lib/db";
import { computeDeliveryFee, computeTotals, evaluateCoupon, type Totals } from "@/lib/pricing";
import { emailField, ghanaPhone } from "@/lib/validation";
import { buildLineView, cartItemInclude, toPricedLines, type CartLineView } from "@/server/cart";
import { countCustomerRedemptions, loadCoupon } from "@/server/coupons";
import { InsufficientStockError, reserveStock } from "@/server/inventory";
import { isOnlinePaymentAvailable } from "@/server/payments/config";
import { generateGuestToken, generateOrderReference } from "./reference";

export const checkoutSchema = z
  .object({
    idempotencyKey: z.uuid(),
    customerName: z.string().trim().min(2, "Enter your full name.").max(80),
    email: z.union([z.literal(""), emailField]).optional(),
    phone: ghanaPhone,
    fulfilmentMethod: z.enum(["DELIVERY", "PICKUP"]),
    zoneId: z.string().max(64).optional(),
    city: z.string().trim().max(80).optional(),
    area: z.string().trim().max(80).optional(),
    addressLine: z.string().trim().max(200).optional(),
    addressDetails: z.string().trim().max(200).optional(),
    deliveryInstructions: z.string().trim().max(500).optional(),
    paymentMethod: z.enum(["PAYSTACK", "CASH_ON_DELIVERY"]),
    saveAddress: z.boolean().optional(),
    expectedTotalMinor: z.number().int().nonnegative(),
  })
  .superRefine((data, ctx) => {
    if (data.fulfilmentMethod === "DELIVERY") {
      if (!data.zoneId) ctx.addIssue({ code: "custom", path: ["zoneId"], message: "Choose your delivery area." });
      if (!data.city) ctx.addIssue({ code: "custom", path: ["city"], message: "Enter your town or city." });
      if (!data.area) ctx.addIssue({ code: "custom", path: ["area"], message: "Enter your area or neighbourhood." });
      if (!data.addressLine || data.addressLine.length < 3) {
        ctx.addIssue({ code: "custom", path: ["addressLine"], message: "Enter your street address or a landmark." });
      }
    }
  });

export type CheckoutInput = z.infer<typeof checkoutSchema>;

export class CheckoutError extends Error {
  constructor(
    message: string,
    readonly code:
      | "EMPTY_CART"
      | "CART_ISSUES"
      | "ZONE"
      | "PICKUP_DISABLED"
      | "PAYMENT_METHOD"
      | "TOTAL_CHANGED"
      | "OUT_OF_STOCK"
      | "COUPON"
      | "EMAIL_REQUIRED",
  ) {
    super(message);
    this.name = "CheckoutError";
  }
}

export interface QuoteResult {
  lines: CartLineView[];
  totals: Totals;
  couponId: string | null;
  couponCode: string | null;
  couponMessage: string | null;
  freeDeliveryApplied: boolean;
  zone: { id: string; name: string; region: string; estimatedDelivery: string | null } | null;
}

interface QuoteParams {
  cartId: string;
  fulfilmentMethod: "DELIVERY" | "PICKUP";
  zoneId?: string;
  who: { userId: string | null; email: string | null };
  settings: StoreSettings;
}

/**
 * Computes authoritative totals for the cart from database values. Used for
 * the live checkout summary and again inside the order transaction.
 */
export async function quoteCart(client: Tx | typeof prisma, params: QuoteParams): Promise<QuoteResult> {
  const [items, cart] = await Promise.all([
    client.cartItem.findMany({ where: { cartId: params.cartId }, include: cartItemInclude, orderBy: { createdAt: "asc" } }),
    client.cart.findUnique({ where: { id: params.cartId }, select: { couponCode: true } }),
  ]);
  const lines = items.map(buildLineView);
  if (lines.length === 0) throw new CheckoutError("Your cart is empty.", "EMPTY_CART");
  if (lines.some((line) => !line.purchasable)) {
    throw new CheckoutError("Some items in your cart are unavailable or exceed available stock. Please review your cart.", "CART_ISSUES");
  }
  const priced = toPricedLines(lines);

  let discount = 0;
  let couponId: string | null = null;
  let couponMessage: string | null = null;
  if (cart?.couponCode) {
    const loaded = await loadCoupon(cart.couponCode, client);
    if (loaded) {
      const used = await countCustomerRedemptions(loaded.coupon.id, params.who, client);
      const result = evaluateCoupon(loaded.rule, priced, new Date(), used);
      if (result.ok) {
        discount = result.discountMinor;
        couponId = loaded.coupon.id;
      } else {
        couponMessage = result.message;
      }
    } else {
      couponMessage = "This coupon is no longer available.";
    }
  }

  const goodsTotal = priced.reduce((sum, line) => sum + line.lineTotalMinor, 0) - discount;
  let deliveryFee = 0;
  let freeDeliveryApplied = false;
  let zone: QuoteResult["zone"] = null;

  if (params.fulfilmentMethod === "PICKUP") {
    if (!params.settings.pickupEnabled) throw new CheckoutError("Store pickup is not available at the moment.", "PICKUP_DISABLED");
  } else if (params.zoneId) {
    const record = await client.deliveryZone.findUnique({ where: { id: params.zoneId } });
    if (!record) throw new CheckoutError("Please choose a delivery area from the list.", "ZONE");
    const fee = computeDeliveryFee(record, goodsTotal);
    if (!fee.ok) throw new CheckoutError(fee.message, "ZONE");
    deliveryFee = fee.feeMinor;
    freeDeliveryApplied = fee.freeDeliveryApplied;
    zone = { id: record.id, name: record.name, region: record.region, estimatedDelivery: record.estimatedDelivery };
  }

  return {
    lines,
    totals: computeTotals({ lines: priced, discountMinor: discount, deliveryFeeMinor: deliveryFee }),
    couponId,
    couponCode: couponId ? cart?.couponCode ?? null : null,
    couponMessage,
    freeDeliveryApplied,
    zone,
  };
}

export interface CreatedOrder {
  orderId: string;
  reference: string;
  paymentMethod: "PAYSTACK" | "CASH_ON_DELIVERY";
  guestToken: string | null;
  duplicate: boolean;
}

/**
 * Creates the order in a single transaction:
 * validate → re-price → check stock atomically → record order, items,
 * movements, coupon redemption, status history → clear the cart.
 */
export async function createOrder(
  input: CheckoutInput,
  ctx: { cartId: string; user: { id: string; email: string } | null; settings: StoreSettings; now?: Date },
): Promise<CreatedOrder> {
  const existing = await prisma.order.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) {
    return { orderId: existing.id, reference: existing.reference, paymentMethod: existing.paymentMethod, guestToken: null, duplicate: true };
  }

  const email = (input.email || ctx.user?.email || "").toLowerCase() || null;
  if (!ctx.user && !email) throw new CheckoutError("Please enter your email so we can send your order confirmation.", "EMAIL_REQUIRED");

  if (input.paymentMethod === "PAYSTACK") {
    if (!isOnlinePaymentAvailable(ctx.settings)) throw new CheckoutError("Online payment is not available right now.", "PAYMENT_METHOD");
    if (!email) throw new CheckoutError("An email address is required for online payment.", "EMAIL_REQUIRED");
  }
  if (input.paymentMethod === "CASH_ON_DELIVERY" && !ctx.settings.codEnabled) {
    throw new CheckoutError("Cash on delivery is not available right now.", "PAYMENT_METHOD");
  }

  const now = ctx.now ?? new Date();
  const guest = ctx.user ? null : generateGuestToken();

  try {
    const order = await prisma.$transaction(
      async (tx) => {
        const quote = await quoteCart(tx, {
          cartId: ctx.cartId,
          fulfilmentMethod: input.fulfilmentMethod,
          zoneId: input.zoneId,
          who: { userId: ctx.user?.id ?? null, email },
          settings: ctx.settings,
        });
        if (quote.totals.totalMinor !== input.expectedTotalMinor) {
          throw new CheckoutError("Your order total has changed since you opened checkout. Please review the updated summary.", "TOTAL_CHANGED");
        }

        const isOnline = input.paymentMethod === "PAYSTACK";
        const created = await tx.order.create({
          data: {
            reference: generateOrderReference(now),
            idempotencyKey: input.idempotencyKey,
            userId: ctx.user?.id ?? null,
            guestTokenHash: guest?.hash ?? null,
            customerName: input.customerName,
            email,
            phone: input.phone,
            fulfilmentMethod: input.fulfilmentMethod,
            zoneId: quote.zone?.id ?? null,
            zoneName: quote.zone?.name ?? null,
            region: quote.zone?.region ?? null,
            city: input.fulfilmentMethod === "DELIVERY" ? input.city : null,
            area: input.fulfilmentMethod === "DELIVERY" ? input.area : null,
            addressLine: input.fulfilmentMethod === "DELIVERY" ? input.addressLine : null,
            addressDetails: input.fulfilmentMethod === "DELIVERY" ? input.addressDetails || null : null,
            deliveryInstructions: input.deliveryInstructions || null,
            ...quote.totals,
            couponId: quote.couponId,
            couponCode: quote.couponCode,
            paymentMethod: input.paymentMethod,
            paymentStatus: isOnline ? "PENDING" : "UNPAID",
            status: isOnline ? "PENDING_PAYMENT" : "CONFIRMED",
            paymentDueAt: isOnline ? new Date(now.getTime() + ctx.settings.pendingPaymentTtlMinutes * 60_000) : null,
            items: {
              create: quote.lines.map((line) => ({
                productId: line.productId,
                variantId: line.variantId,
                productName: line.productName,
                variantName: line.variantName,
                sku: line.sku,
                unit: line.unit,
                imageUrl: line.imageUrl,
                unitPriceMinor: line.unitPriceMinor,
                quantityMilli: line.quantityMilli,
                lineTotalMinor: line.lineTotalMinor,
              })),
            },
            statusHistory: {
              create: {
                toStatus: isOnline ? "PENDING_PAYMENT" : "CONFIRMED",
                note: isOnline ? "Order placed — awaiting online payment." : "Order placed — cash on delivery.",
                actorId: ctx.user?.id ?? null,
              },
            },
          },
        });

        for (const line of quote.lines) {
          await reserveStock(tx, { variantId: line.variantId, quantityMilli: line.quantityMilli, orderId: created.id });
        }

        if (quote.couponId) {
          const updated = await tx.$executeRaw`
            UPDATE "Coupon" SET "usedCount" = "usedCount" + 1, "updatedAt" = now()
            WHERE id = ${quote.couponId} AND ("usageLimit" IS NULL OR "usedCount" < "usageLimit")
          `;
          if (updated !== 1) throw new CheckoutError("This coupon has just reached its usage limit. Please remove it and try again.", "COUPON");
          await tx.couponRedemption.create({ data: { couponId: quote.couponId, orderId: created.id, userId: ctx.user?.id ?? null, email } });
        }

        await tx.cartItem.deleteMany({ where: { cartId: ctx.cartId } });
        await tx.cart.update({ where: { id: ctx.cartId }, data: { couponCode: null } });

        if (ctx.user && input.saveAddress && input.fulfilmentMethod === "DELIVERY" && input.city && input.area && input.addressLine) {
          const hasDefault = await tx.address.count({ where: { userId: ctx.user.id, isDefault: true } });
          await tx.address.create({
            data: {
              userId: ctx.user.id,
              recipientName: input.customerName,
              phone: input.phone,
              region: quote.zone?.region ?? "",
              city: input.city,
              area: input.area,
              addressLine: input.addressLine,
              details: input.addressDetails || null,
              zoneId: quote.zone?.id ?? null,
              isDefault: hasDefault === 0,
            },
          });
        }
        return created;
      },
      { timeout: 20_000, maxWait: 10_000 },
    );

    return { orderId: order.id, reference: order.reference, paymentMethod: order.paymentMethod, guestToken: guest?.token ?? null, duplicate: false };
  } catch (error) {
    if (error instanceof InsufficientStockError) {
      throw new CheckoutError("Sorry — one of your items has just sold out. Please review your cart.", "OUT_OF_STOCK");
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const duplicate = await prisma.order.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (duplicate) {
        return { orderId: duplicate.id, reference: duplicate.reference, paymentMethod: duplicate.paymentMethod, guestToken: null, duplicate: true };
      }
    }
    throw error;
  }
}
