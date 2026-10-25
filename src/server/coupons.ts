import "server-only";
import type { Coupon } from "@/generated/prisma/client";
import { prisma, type Tx } from "@/lib/db";
import type { CouponRule } from "@/lib/pricing";

export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

export type LoadedCoupon = { coupon: Coupon; rule: CouponRule };

export async function loadCoupon(code: string, client: Tx | typeof prisma = prisma): Promise<LoadedCoupon | null> {
  const normalized = normalizeCouponCode(code);
  if (!normalized) return null;
  const coupon = await client.coupon.findUnique({
    where: { code: normalized },
    include: { products: { select: { id: true } }, categories: { select: { id: true } } },
  });
  if (!coupon) return null;
  return {
    coupon,
    rule: {
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      maxDiscountMinor: coupon.maxDiscountMinor,
      minOrderMinor: coupon.minOrderMinor,
      scope: coupon.scope,
      productIds: coupon.products.map((p) => p.id),
      categoryIds: coupon.categories.map((c) => c.id),
      startsAt: coupon.startsAt,
      endsAt: coupon.endsAt,
      usageLimit: coupon.usageLimit,
      usedCount: coupon.usedCount,
      perCustomerLimit: coupon.perCustomerLimit,
      isActive: coupon.isActive,
    },
  };
}

/** Redemptions by this customer (matched by account or by email for guests). */
export async function countCustomerRedemptions(
  couponId: string,
  who: { userId?: string | null; email?: string | null },
  client: Tx | typeof prisma = prisma,
): Promise<number> {
  const or = [
    ...(who.userId ? [{ userId: who.userId }] : []),
    ...(who.email ? [{ email: who.email.toLowerCase() }] : []),
  ];
  if (or.length === 0) return 0;
  return client.couponRedemption.count({ where: { couponId, OR: or } });
}
