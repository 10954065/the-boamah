import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/ui";
import { ProductForm } from "@/components/admin/product-form";
import { prisma } from "@/lib/db";
import { minorToDecimalString } from "@/lib/money";
import { formatQuantity, milliToDecimalString, type SellingUnitCode } from "@/lib/quantity";
import { requireStaffPage } from "@/server/session";

export const metadata = { title: "Edit product" };

export default async function EditProductPage({ params }: PageProps<"/admin/products/[id]">) {
  const { id } = await params;
  await requireStaffPage("catalog:edit", `/admin/products/${id}`);
  const [product, categories] = await Promise.all([
    prisma.product.findUnique({
      where: { id },
      include: { images: { orderBy: { sortOrder: "asc" } }, variants: { orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }], include: { priceTiers: { orderBy: { minQtyMilli: "asc" } } } },
      },
    }),
    prisma.category.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!product) notFound();
  const defaultIndex = Math.max(0, product.variants.findIndex((v) => v.isDefault));

  return (
    <>
      <Link href="/admin/products" className="text-sm font-medium text-brand-700 hover:underline">← Products</Link>
      <div className="mt-2">
        <AdminHeader
          title={product.name}
          description={
            product.status === "PUBLISHED" ? (
              <Link href={`/products/${product.slug}`} className="text-brand-700 hover:underline" target="_blank">
                View in store ↗
              </Link>
            ) : (
              "Not visible to customers"
            )
          }
        />
      </div>
      <ProductForm
        canDelete
        categories={categories}
        initial={{
          id: product.id,
          name: product.name,
          slug: product.slug,
          description: product.description,
          shortDescription: product.shortDescription ?? "",
          searchKeywords: product.searchKeywords,
          categoryId: product.categoryId,
          status: product.status,
          isFeatured: product.isFeatured,
          images: product.images.map((i) => ({ url: i.url, alt: i.alt })),
          defaultIndex,
          variants: product.variants.map((v) => ({
            id: v.id,
            name: v.name,
            sku: v.sku,
            unit: v.unit as SellingUnitCode,
            price: minorToDecimalString(v.priceMinor),
            salePrice: v.salePriceMinor !== null ? minorToDecimalString(v.salePriceMinor) : "",
            // Ghana time is GMT, so the UTC value is what the admin sees on the shop's clock.
            saleEndsAt: v.saleEndsAt ? v.saleEndsAt.toISOString().slice(0, 16) : "",
            step: milliToDecimalString(v.stepMilli),
            min: milliToDecimalString(v.minQtyMilli),
            max: v.maxQtyMilli !== null ? milliToDecimalString(v.maxQtyMilli) : "",
            lowStock: milliToDecimalString(v.lowStockMilli),
            openingStock: "",
            isActive: v.isActive,
            tiers: v.priceTiers.map((t) => ({ minQty: milliToDecimalString(t.minQtyMilli), price: minorToDecimalString(t.unitPriceMinor) })),
            currentStock: formatQuantity(v.stockMilli, v.unit as SellingUnitCode),
          })),
        }}
      />
    </>
  );
}
