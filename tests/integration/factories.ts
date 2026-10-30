import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import type { StoreSettings } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import type { RoleCode } from "@/lib/permissions";
import { DEFAULT_SETTINGS } from "@/server/settings";

const TABLES = [
  "PosReturnItem", "PosReturn", "PosPayment", "PosSaleItem", "PosSale", "PosShift", "PosTill",
  "Review", "StockAlert", "PriceTier", "PaymentEvent", "Notification", "AuditLog", "InventoryMovement", "Payment", "CouponRedemption", "OrderNote",
  "OrderStatusHistory", "OrderItem", "Order", "CartItem", "Cart", "WishlistItem", "Address", "ProductImage",
  "ProductVariant", "_CouponProducts", "_CouponCategories", "Coupon", "Product", "Category", "DeliveryZone",
  "PromoBanner", "StoreSettings", "rate_limit", "session", "account", "verification", "user",
];

export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

export const settings = (overrides: Partial<StoreSettings> = {}): StoreSettings => ({
  ...DEFAULT_SETTINGS,
  codEnabled: true,
  pickupEnabled: true,
  onlinePaymentEnabled: true,
  pendingPaymentTtlMinutes: 60,
  ...overrides,
});

export async function createVariant(opts: { price: number; sale?: number | null; stock: number; step?: number; min?: number; unit?: "ITEM" | "KG" }) {
  const category = await prisma.category.create({ data: { name: `Cat ${randomUUID().slice(0, 6)}`, slug: `cat-${randomUUID().slice(0, 8)}` } });
  const product = await prisma.product.create({
    data: {
      name: `Product ${randomUUID().slice(0, 6)}`,
      slug: `p-${randomUUID().slice(0, 8)}`,
      description: "Integration test product",
      categoryId: category.id,
      status: "PUBLISHED",
      publishedAt: new Date(),
      variants: {
        create: {
          name: "Default",
          sku: `SKU-${randomUUID().slice(0, 8).toUpperCase()}`,
          unit: opts.unit ?? "ITEM",
          priceMinor: opts.price,
          salePriceMinor: opts.sale ?? null,
          stockMilli: opts.stock,
          stepMilli: opts.step ?? 1000,
          minQtyMilli: opts.min ?? 1000,
          isDefault: true,
        },
      },
    },
    include: { variants: true },
  });
  return { category, product, variant: product.variants[0]! };
}

export async function createCart(items: { variantId: string; quantityMilli: number; seen: number }[], couponCode?: string) {
  return prisma.cart.create({
    data: {
      token: randomUUID(),
      couponCode: couponCode ?? null,
      items: { create: items.map((i) => ({ variantId: i.variantId, quantityMilli: i.quantityMilli, seenUnitPriceMinor: i.seen })) },
    },
  });
}

export async function createZone(fee = 2000, minOrder = 0, freeFrom: number | null = null) {
  return prisma.deliveryZone.create({
    data: { name: "Test Zone", region: "Greater Accra", areas: ["Osu"], feeMinor: fee, minOrderMinor: minOrder, freeDeliveryThresholdMinor: freeFrom },
  });
}

export function checkoutInput(overrides: Record<string, unknown> = {}) {
  return {
    idempotencyKey: randomUUID(),
    customerName: "Test Customer",
    email: "customer@example.com",
    phone: "0241234567",
    fulfilmentMethod: "PICKUP" as const,
    paymentMethod: "CASH_ON_DELIVERY" as const,
    expectedTotalMinor: 0,
    ...overrides,
  };
}

export async function createTill(code = "T1", isActive = true) {
  return prisma.posTill.create({ data: { code, name: `Till ${code}`, isActive } });
}

export async function createStaff(role: RoleCode = "CASHIER") {
  const id = randomUUID();
  return prisma.user.create({ data: { id, name: `Staff ${id.slice(0, 6)}`, email: `${id.slice(0, 8)}@example.com`, role } });
}

/** Staff who can sign in with a password, as a manager approving at the till does. */
export async function createStaffWithPassword(password: string, role: RoleCode = "STORE_MANAGER") {
  const user = await createStaff(role);
  await prisma.account.create({ data: { id: randomUUID(), accountId: user.id, providerId: "credential", userId: user.id, password: await hashPassword(password) } });
  return user;
}
