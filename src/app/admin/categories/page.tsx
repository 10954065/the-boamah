import { CategoryManager } from "@/components/admin/catalog-managers";
import { AdminHeader } from "@/components/admin/ui";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { requireStaffPage } from "@/server/session";

export const metadata = { title: "Categories" };

export default async function AdminCategoriesPage() {
  const user = await requireStaffPage("catalog:view", "/admin/categories");
  const categories = await prisma.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { products: true } } },
  });
  return (
    <>
      <AdminHeader
        title="Categories"
        description="Categories with products cannot be deleted — hide them or move their products first."
      />
      <CategoryManager
        canEdit={hasPermission(user.role, "catalog:edit")}
        categories={categories.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          description: c.description,
          imageUrl: c.imageUrl,
          sortOrder: c.sortOrder,
          isActive: c.isActive,
          productCount: c._count.products,
        }))}
      />
    </>
  );
}
