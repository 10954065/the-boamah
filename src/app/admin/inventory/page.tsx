import type { Prisma } from "@/generated/prisma/client";
import { StockAdjustButton } from "@/components/admin/catalog-managers";
import { AdminHeader, EmptyRow, FilterBar, Panel, TableWrap, td, th } from "@/components/admin/ui";
import { Checkbox, Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { prisma } from "@/lib/db";
import { formatQuantity, UNIT_INFO, type SellingUnitCode } from "@/lib/quantity";
import { cn, formatDateTime } from "@/lib/utils";
import { requireStaffPage } from "@/server/session";

export const metadata = { title: "Inventory" };
const PAGE_SIZE = 30;

const MOVEMENT_LABELS: Record<string, string> = {
  INITIAL: "Opening stock",
  RECEIPT: "Received",
  ADJUSTMENT: "Adjustment",
  CORRECTION: "Correction",
  ORDER_RESERVED: "Order",
  ORDER_RELEASED: "Order cancelled",
  POS_SALE: "Till sale",
  POS_VOID: "Till sale voided",
  POS_RETURN: "Returned at the till",
};

export default async function InventoryPage({ searchParams }: PageProps<"/admin/inventory">) {
  await requireStaffPage("inventory:adjust", "/admin/inventory");
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 80) : "";
  const lowOnly = params.low === "1";
  const page = Math.max(1, Number.parseInt(typeof params.page === "string" ? params.page : "1", 10) || 1);

  let lowIds: string[] | undefined;
  if (lowOnly) {
    const rows = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM "ProductVariant" WHERE "isActive" AND "stockMilli" <= "lowStockMilli"`;
    lowIds = rows.map((r) => r.id);
  }
  const where: Prisma.ProductVariantWhereInput = {
    product: { status: { not: "ARCHIVED" } },
    ...(q ? { OR: [{ sku: { contains: q, mode: "insensitive" } }, { product: { name: { contains: q, mode: "insensitive" } } }] } : {}),
    ...(lowIds ? { id: { in: lowIds } } : {}),
  };

  const [variants, total, movements] = await Promise.all([
    prisma.productVariant.findMany({
      where,
      include: { product: { select: { name: true } }, _count: { select: { stockAlerts: { where: { notifiedAt: null } } } } },
      orderBy: [{ product: { name: "asc" } }, { sortOrder: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.productVariant.count({ where }),
    prisma.inventoryMovement.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      include: { variant: { select: { name: true, unit: true, product: { select: { name: true } } } }, actor: { select: { name: true } }, order: { select: { reference: true } } },
    }),
  ]);

  return (
    <>
      <AdminHeader title="Inventory" description="Stock is reserved when an order is placed and returned if the order is cancelled." />
      <FilterBar action="/admin/inventory">
        <div className="min-w-56 flex-1">
          <label htmlFor="q" className="mb-1 block text-xs font-medium text-ink-muted">Search product or SKU</label>
          <Input id="q" name="q" defaultValue={q} />
        </div>
        <label className="flex h-10 items-center gap-2 text-sm">
          <Checkbox name="low" value="1" defaultChecked={lowOnly} /> Low stock only
        </label>
      </FilterBar>

      <TableWrap>
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-line bg-soft/60">
            <tr>
              <th scope="col" className={th}>Product / option</th>
              <th scope="col" className={th}>SKU</th>
              <th scope="col" className={th}>In stock</th>
              <th scope="col" className={th}>Alert at</th>
              <th scope="col" className={cn(th, "text-right")}>Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {variants.length === 0 ? <EmptyRow colSpan={5}>Nothing matches these filters.</EmptyRow> : null}
            {variants.map((v) => {
              const unit = v.unit as SellingUnitCode;
              const low = v.stockMilli <= v.lowStockMilli;
              return (
                <tr key={v.id}>
                  <td className={td}>
                    <p className="font-semibold">{v.product.name}</p>
                    <p className="text-xs text-ink-subtle">
                      {v.name}
                      {!v.isActive ? " · not for sale" : ""}
                    </p>
                  </td>
                  <td className={cn(td, "font-mono text-xs")}>{v.sku}</td>
                  <td className={cn(td, "tabular-nums font-semibold", v.stockMilli === 0 ? "text-danger" : low ? "text-warning" : "")}>
                    {v.stockMilli === 0 ? "Out of stock" : formatQuantity(v.stockMilli, unit)}
                    {v._count.stockAlerts > 0 ? (
                      <span className="mt-0.5 block text-xs font-medium text-brand-700">
                        {v._count.stockAlerts} waiting to hear it is back
                      </span>
                    ) : null}
                  </td>
                  <td className={cn(td, "tabular-nums text-ink-muted")}>{formatQuantity(v.lowStockMilli, unit)}</td>
                  <td className={cn(td, "text-right")}>
                    <StockAdjustButton variantId={v.id} label={`${v.product.name} (${v.name})`} unitLabel={UNIT_INFO[unit].plural} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableWrap>
      <Pagination
        className="mt-6"
        page={page}
        totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))}
        hrefFor={(n) => `/admin/inventory?${new URLSearchParams({ ...(q ? { q } : {}), ...(lowOnly ? { low: "1" } : {}), page: String(n) })}`}
      />

      <Panel title="Recent stock movements" className="mt-8">
        <div className="-m-5 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-line">
              <tr>
                <th scope="col" className={th}>When</th>
                <th scope="col" className={th}>Item</th>
                <th scope="col" className={th}>Change</th>
                <th scope="col" className={th}>Balance</th>
                <th scope="col" className={th}>Reason / by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {movements.map((m) => {
                const unit = m.variant.unit as SellingUnitCode;
                return (
                  <tr key={m.id}>
                    <td className={cn(td, "whitespace-nowrap text-ink-muted")}>{formatDateTime(m.createdAt)}</td>
                    <td className={td}>
                      {m.variant.product.name} <span className="text-ink-subtle">· {m.variant.name}</span>
                    </td>
                    <td className={cn(td, "tabular-nums font-semibold", m.deltaMilli < 0 ? "text-danger" : "text-success")}>
                      {m.deltaMilli > 0 ? "+" : "−"}
                      {formatQuantity(Math.abs(m.deltaMilli), unit)}
                      <span className="ml-1 text-xs font-normal text-ink-subtle">{MOVEMENT_LABELS[m.type]}</span>
                    </td>
                    <td className={cn(td, "tabular-nums")}>{formatQuantity(m.balanceAfterMilli, unit)}</td>
                    <td className={cn(td, "text-ink-muted")}>
                      {m.order ? `Order ${m.order.reference}` : m.reason}
                      {m.actor ? ` · ${m.actor.name}` : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
