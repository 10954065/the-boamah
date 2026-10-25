import { CouponManager } from "@/components/admin/marketing-managers";
import { AdminHeader } from "@/components/admin/ui";
import { prisma } from "@/lib/db";
import { formatMoney, minorToDecimalString } from "@/lib/money";
import { requireStaffPage } from "@/server/session";

export const metadata = { title: "Coupons" };

const toLocalInput = (date: Date | null) => (date ? new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : "");

export default async function CouponsPage() {
  await requireStaffPage("promotions:manage", "/admin/coupons");
  const [coupons, products, categories] = await Promise.all([
    prisma.coupon.findMany({ orderBy: { createdAt: "desc" }, include: { products: { select: { id: true } }, categories: { select: { id: true } } } }),
    prisma.product.findMany({ where: { status: { not: "ARCHIVED" } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.category.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);
  return (
    <>
      <AdminHeader title="Coupons" description="One coupon per order. Coupons are checked again on the server at checkout." />
      <CouponManager
        products={products}
        categories={categories}
        coupons={coupons.map((c) => ({
          id: c.id,
          code: c.code,
          description: c.description ?? "",
          type: c.type,
          value: minorToDecimalString(c.value),
          maxDiscount: c.maxDiscountMinor !== null ? minorToDecimalString(c.maxDiscountMinor) : "",
          minOrder: c.minOrderMinor ? minorToDecimalString(c.minOrderMinor) : "",
          scope: c.scope,
          productIds: c.products.map((p) => p.id),
          categoryIds: c.categories.map((x) => x.id),
          startsAt: toLocalInput(c.startsAt),
          endsAt: toLocalInput(c.endsAt),
          usageLimit: c.usageLimit !== null ? String(c.usageLimit) : "",
          perCustomerLimit: c.perCustomerLimit !== null ? String(c.perCustomerLimit) : "",
          isActive: c.isActive,
          usedCount: c.usedCount,
          summary: `${c.type === "PERCENTAGE" ? `${minorToDecimalString(c.value)}% off` : `${formatMoney(c.value)} off`}${c.minOrderMinor ? ` · min ${formatMoney(c.minOrderMinor)}` : ""}${c.scope !== "ALL" ? ` · ${c.scope.toLowerCase()}` : ""}${c.endsAt ? ` · until ${c.endsAt.toISOString().slice(0, 10)}` : ""}`,
        }))}
      />
    </>
  );
}
