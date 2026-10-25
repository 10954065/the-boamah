"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { getCurrentUser, runAction } from "@/server/session";

export async function toggleWishlist(input: { productId: string }): Promise<ActionResult<{ saved: boolean }>> {
  return runAction("wishlist.toggle", async () => {
    const parsed = z.object({ productId: z.string().min(1).max(64) }).safeParse(input);
    if (!parsed.success) return fail("Invalid product.");
    const user = await getCurrentUser();
    if (!user) return fail("SIGN_IN_REQUIRED");

    const product = await prisma.product.findFirst({
      where: { id: parsed.data.productId, status: "PUBLISHED" },
      select: { id: true },
    });
    if (!product) return fail("This product is no longer available.");

    const key = { userId_productId: { userId: user.id, productId: product.id } };
    const existing = await prisma.wishlistItem.findUnique({ where: key });
    if (existing) {
      await prisma.wishlistItem.delete({ where: key });
    } else {
      await prisma.wishlistItem.create({ data: { userId: user.id, productId: product.id } });
    }
    revalidatePath("/account/wishlist");
    return ok({ saved: !existing }, existing ? "Removed from your wishlist." : "Saved to your wishlist.");
  });
}
