import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/server/session";

/** Product ids on the signed-in customer's wishlist (empty for guests). */
export const getWishlistIds = cache(async (): Promise<Set<string>> => {
  const user = await getCurrentUser();
  if (!user) return new Set();
  const rows = await prisma.wishlistItem.findMany({ where: { userId: user.id }, select: { productId: true } });
  return new Set(rows.map((r) => r.productId));
});
