import type { Metadata } from "next";
import Link from "next/link";
import { Heart } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { ProductGrid } from "@/components/store/product-card";
import { prisma } from "@/lib/db";
import { cardsByIds } from "@/server/catalog";
import { requireUser } from "@/server/session";
import { getWishlistIds } from "@/server/wishlist";

export const metadata: Metadata = { title: "My wishlist", robots: { index: false } };

export default async function WishlistPage() {
  const user = await requireUser("/account/wishlist");
  const items = await prisma.wishlistItem.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, select: { productId: true } });
  const savedIds = await getWishlistIds();
  // Only currently published products are returned, in the order they were saved.
  const products = await cardsByIds(items.map((i) => i.productId));

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">My wishlist</h1>
      {products.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface">
          <EmptyState
            icon={<Heart />}
            title="Your wishlist is empty"
            description="Tap the heart on any product to save it for later."
            action={
              <Link href="/shop" className={buttonVariants()}>
                Browse products
              </Link>
            }
          />
        </div>
      ) : (
        <ProductGrid products={products} savedIds={savedIds} className="xl:grid-cols-4" />
      )}
    </div>
  );
}
