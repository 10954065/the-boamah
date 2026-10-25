import Link from "next/link";
import { AdminHeader } from "@/components/admin/ui";
import { ProductForm } from "@/components/admin/product-form";
import { prisma } from "@/lib/db";
import { requireStaffPage } from "@/server/session";

export const metadata = { title: "New product" };

export default async function NewProductPage() {
  await requireStaffPage("catalog:edit", "/admin/products/new");
  const categories = await prisma.category.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } });
  return (
    <>
      <Link href="/admin/products" className="text-sm font-medium text-brand-700 hover:underline">← Products</Link>
      <div className="mt-2">
        <AdminHeader title="New product" description="Products start as drafts until you publish them." />
      </div>
      {categories.length === 0 ? (
        <p className="text-sm text-ink-muted">Create a category first.</p>
      ) : (
        <ProductForm categories={categories} canDelete={false} />
      )}
    </>
  );
}
