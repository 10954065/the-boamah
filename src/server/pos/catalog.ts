import "server-only";
import { prisma } from "@/lib/db";
import type { PosCatalogItem } from "@/lib/pos-till";
import type { SellingUnitCode } from "@/lib/quantity";

/**
 * Everything the till can sell: each active option of every published
 * product, with the same photo, price and stock the shop shows. Read fresh
 * every time (never from the storefront cache) because the till needs the
 * stock as it is now.
 */
export async function loadPosCatalog(): Promise<PosCatalogItem[]> {
  const products = await prisma.product.findMany({
    where: { status: "PUBLISHED", variants: { some: { isActive: true } } },
    orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
    select: {
      name: true,
      searchKeywords: true,
      category: { select: { id: true, name: true } },
      images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true, alt: true } },
      variants: {
        where: { isActive: true },
        orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }],
        select: {
          id: true,
          name: true,
          sku: true,
          barcode: true,
          unit: true,
          priceMinor: true,
          salePriceMinor: true,
          saleEndsAt: true,
          stockMilli: true,
          lowStockMilli: true,
          priceTiers: { orderBy: { minQtyMilli: "asc" }, select: { minQtyMilli: true, unitPriceMinor: true } },
        },
      },
    },
  });

  return products.flatMap((product) =>
    product.variants.map((variant) => ({
      variantId: variant.id,
      productName: product.name,
      variantName: variant.name,
      sku: variant.sku,
      barcode: variant.barcode,
      unit: variant.unit as SellingUnitCode,
      categoryId: product.category.id,
      categoryName: product.category.name,
      imageUrl: product.images[0]?.url ?? null,
      imageAlt: product.images[0]?.alt || product.name,
      priceMinor: variant.priceMinor,
      salePriceMinor: variant.salePriceMinor,
      saleEndsAt: variant.saleEndsAt?.toISOString() ?? null,
      tiers: variant.priceTiers,
      stockMilli: variant.stockMilli,
      lowStockMilli: variant.lowStockMilli,
      keywords: [product.name, variant.name, variant.sku, variant.barcode ?? "", product.searchKeywords, product.category.name].join(" ").toLowerCase(),
    })),
  );
}
