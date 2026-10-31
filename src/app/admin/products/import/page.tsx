import Link from "next/link";
import { AdminHeader } from "@/components/admin/ui";
import { ProductImport } from "@/components/admin/product-import";
import { requireStaffPage } from "@/server/session";

export const metadata = { title: "Import products" };

export default async function ImportProductsPage() {
  await requireStaffPage("catalog:edit", "/admin/products/import");
  return (
    <>
      <Link href="/admin/products" className="text-sm font-medium text-brand-700 hover:underline">← Products</Link>
      <div className="mt-2">
        <AdminHeader
          title="Import products from Excel"
          description="Add many products at once, or update prices, stock and details from one sheet. New products are saved as drafts for you to check, add photos to and publish."
        />
      </div>
      <ProductImport />
    </>
  );
}
