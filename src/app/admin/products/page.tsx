import Image from "next/image";
import Link from "next/link";
import { FileSpreadsheet, Plus } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { AdminHeader, EmptyRow, FilterBar, TableWrap, td, th } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { hasPermission } from "@/lib/permissions";
import { effectiveUnitPrice } from "@/lib/pricing";
import { formatQuantity, type SellingUnitCode } from "@/lib/quantity";
import { cn } from "@/lib/utils";
import { requireStaffPage } from "@/server/session";

export const metadata = { title: "Products" };
const PAGE_SIZE = 25;

export default async function AdminProductsPage({ searchParams }: PageProps<"/admin/products">) {
  const user = await requireStaffPage("catalog:view", "/admin/products");
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 80) : "";
  const status = typeof params.status === "string" && ["DRAFT", "PUBLISHED", "ARCHIVED"].includes(params.status) ? params.status : "";
  const categoryId = typeof params.category === "string" ? params.category : "";
  const page = Math.max(1, Number.parseInt(typeof params.page === "string" ? params.page : "1", 10) || 1);

  const where: Prisma.ProductWhereInput = {
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { variants: { some: { sku: { contains: q, mode: "insensitive" } } } }] } : {}),
    ...(status ? { status: status as "DRAFT" | "PUBLISHED" | "ARCHIVED" } : {}),
    ...(categoryId ? { categoryId } : {}),
  };
  const [products, total, categories] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { category: { select: { name: true } }, images: { take: 1, orderBy: { sortOrder: "asc" } }, variants: { orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }] } },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.product.count({ where }),
    prisma.category.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);
  const canEdit = hasPermission(user.role, "catalog:edit");
  const query = new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}), ...(categoryId ? { category: categoryId } : {}) });

  return (
    <>
      <AdminHeader
        title="Products"
        description={`${total} product${total === 1 ? "" : "s"}`}
        actions={
          canEdit ? (
            <>
              <Link href="/admin/products/import" className={buttonVariants({ variant: "outline" })}>
                <FileSpreadsheet /> Import from Excel
              </Link>
              <Link href="/admin/products/new" className={buttonVariants()}>
                <Plus /> New product
              </Link>
            </>
          ) : null
        }
      />
      <FilterBar action="/admin/products">
        <div className="min-w-56 flex-1">
          <label htmlFor="q" className="mb-1 block text-xs font-medium text-ink-muted">Search name or SKU</label>
          <Input id="q" name="q" defaultValue={q} />
        </div>
        <div>
          <label htmlFor="category" className="mb-1 block text-xs font-medium text-ink-muted">Category</label>
          <Select id="category" name="category" defaultValue={categoryId}>
            <option value="">All</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="status" className="mb-1 block text-xs font-medium text-ink-muted">Status</label>
          <Select id="status" name="status" defaultValue={status}>
            <option value="">All</option>
            <option value="PUBLISHED">Published</option>
            <option value="DRAFT">Draft</option>
            <option value="ARCHIVED">Archived</option>
          </Select>
        </div>
      </FilterBar>
      <TableWrap>
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-line bg-soft/60">
            <tr>
              <th scope="col" className={th}>Product</th>
              <th scope="col" className={th}>Category</th>
              <th scope="col" className={th}>Status</th>
              <th scope="col" className={th}>Price</th>
              <th scope="col" className={th}>Stock (default)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {products.length === 0 ? <EmptyRow colSpan={5}>No products match these filters.</EmptyRow> : null}
            {products.map((product) => {
              const variant = product.variants.find((v) => v.isActive) ?? product.variants[0];
              const low = variant ? variant.stockMilli <= variant.lowStockMilli : false;
              return (
                <tr key={product.id} className="hover:bg-soft/40">
                  <td className={td}>
                    <div className="flex items-center gap-3">
                      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded bg-soft">
                        {product.images[0] ? <Image src={product.images[0].url} alt="" fill sizes="40px" className="object-cover" /> : null}
                      </div>
                      <div className="min-w-0">
                        {canEdit ? (
                          <Link href={`/admin/products/${product.id}`} className="font-semibold text-ink hover:text-brand-700">{product.name}</Link>
                        ) : (
                          <span className="font-semibold text-ink">{product.name}</span>
                        )}
                        <p className="text-xs text-ink-subtle">{product.variants.length} {product.variants.length === 1 ? "option" : "options"}{product.isFeatured ? " · Featured" : ""}</p>
                      </div>
                    </div>
                  </td>
                  <td className={td}>{product.category.name}</td>
                  <td className={td}>
                    <Badge tone={product.status === "PUBLISHED" ? "success" : product.status === "DRAFT" ? "warning" : "neutral"}>
                      {product.status.charAt(0) + product.status.slice(1).toLowerCase()}
                    </Badge>
                  </td>
                  <td className={cn(td, "tabular-nums")}>{variant ? formatMoney(effectiveUnitPrice(variant)) : "Not set"}</td>
                  <td className={cn(td, "tabular-nums", low && "font-semibold text-danger")}>
                    {variant ? formatQuantity(variant.stockMilli, variant.unit as SellingUnitCode) : "Not set"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableWrap>
      <Pagination className="mt-6" page={page} totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))} hrefFor={(n) => `/admin/products?${new URLSearchParams({ ...Object.fromEntries(query), page: String(n) })}`} />
    </>
  );
}
