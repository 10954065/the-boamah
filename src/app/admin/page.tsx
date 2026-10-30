import Link from "next/link";
import { AdminHeader, OrderStatusBadge, Panel, PaymentStatusBadge, StatCard, td, th } from "@/components/admin/ui";
import { formatMoney } from "@/lib/money";
import { formatQuantity, type SellingUnitCode } from "@/lib/quantity";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { getDashboardMetrics } from "@/server/admin-metrics";
import { hasPermission } from "@/lib/permissions";
import { dayString } from "@/lib/pos-report";
import { tillTakingsSince } from "@/server/pos/reports";
import { requireStaffPage } from "@/server/session";

export const metadata = { title: "Dashboard" };

const RANGES = [7, 30, 90] as const;

export default async function AdminDashboard({ searchParams }: PageProps<"/admin">) {
  const user = await requireStaffPage("dashboard:view");
  const params = await searchParams;
  const days = RANGES.find((r) => String(r) === params.days) ?? 30;
  const showTill = hasPermission(user.role, "pos:manage");
  const now = new Date();
  const since = new Date(now.getTime() - days * 86_400_000);
  const [m, till] = await Promise.all([getDashboardMetrics(days), showTill ? tillTakingsSince(since) : null]);
  const tillPeriod = new URLSearchParams({ from: dayString(since), to: dayString(now) });
  const maxDaily = Math.max(1, ...m.daily.map((d) => d.paidMinor));

  return (
    <>
      <AdminHeader
        title="Dashboard"
        description={`Figures for the last ${days} days unless stated. Revenue counts verified payments only.`}
        actions={
          <nav aria-label="Date range" className="flex rounded-md border border-line bg-surface p-0.5">
            {RANGES.map((range) => (
              <Link
                key={range}
                href={`/admin?days=${range}`}
                aria-current={range === days ? "true" : undefined}
                className={cn("rounded px-3 py-1.5 text-sm font-medium", range === days ? "bg-brand-700 text-white" : "text-ink-muted hover:bg-soft")}
              >
                {range} days
              </Link>
            ))}
          </nav>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Paid revenue" value={formatMoney(m.paidRevenueMinor)} hint="Verified online + recorded cash" tone="brand" />
        <StatCard label="Orders" value={String(m.totalOrders)} hint={`${m.completedOrders} delivered / collected`} href="/admin/orders" />
        <StatCard label="Awaiting processing" value={String(m.awaitingProcessing)} hint="Confirmed, being prepared or ready (all time)" tone={m.awaitingProcessing ? "warning" : "neutral"} href="/admin/orders?status=CONFIRMED" />
        <StatCard label="Customers" value={String(m.customers)} hint="Registered accounts" href="/admin/customers" />
        <StatCard label="Awaiting online payment" value={formatMoney(m.pendingOnline.amountMinor)} hint={`${m.pendingOnline.count} order(s), not counted as revenue`} href="/admin/orders?status=PENDING_PAYMENT" />
        <StatCard label="Cash on delivery outstanding" value={formatMoney(m.codOutstanding.amountMinor)} hint={`${m.codOutstanding.count} order(s) to collect`} tone={m.codOutstanding.count ? "warning" : "neutral"} href="/admin/orders?payment=UNPAID" />
        <StatCard label="Low stock options" value={String(m.lowStock.length)} hint="At or below their alert level" tone={m.lowStock.length ? "danger" : "neutral"} href="/admin/inventory?low=1" />
        {till ? (
          <StatCard
            label="Till takings"
            value={formatMoney(till.salesTotalMinor - till.refundedMinor)}
            hint={`${till.salesCount} sale${till.salesCount === 1 ? "" : "s"} in the shop, less refunds`}
            href={`/admin/till?${tillPeriod}`}
          />
        ) : null}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Panel title="Paid revenue per day">
          <figure>
            <div className="flex h-44 items-end gap-[3px]" role="img" aria-label={`Bar chart of paid revenue per day for the last ${days} days`}>
              {m.daily.map((d) => (
                <div key={d.day} className="group relative flex h-full flex-1 items-end">
                  <div
                    className="w-full rounded-t-sm bg-brand-500 transition-colors group-hover:bg-brand-700"
                    style={{ height: `${Math.max(d.paidMinor ? 4 : 1, (d.paidMinor / maxDaily) * 100)}%`, opacity: d.paidMinor ? 1 : 0.25 }}
                  />
                  <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-ink px-2 py-1 text-[11px] text-white group-hover:block">
                    {formatDate(d.day)}: {formatMoney(d.paidMinor)} · {d.orders} order(s)
                  </span>
                </div>
              ))}
            </div>
            <figcaption className="mt-2 flex justify-between text-xs text-ink-subtle">
              <span>{formatDate(m.daily[0]?.day ?? new Date())}</span>
              <span>Today</span>
            </figcaption>
          </figure>
        </Panel>

        <Panel title="Best sellers">
          {m.bestSellers.length === 0 ? (
            <p className="text-sm text-ink-muted">No completed sales in this period yet.</p>
          ) : (
            <ol className="space-y-3 text-sm">
              {m.bestSellers.map((item, index) => (
                <li key={item.productId} className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-soft text-xs font-bold">{index + 1}</span>
                  <Link href={`/admin/products/${item.productId}`} className="flex-1 truncate font-medium hover:text-brand-700">
                    {item.name}
                  </Link>
                  <span className="tabular-nums text-ink-muted">{formatMoney(item.revenueMinor)}</span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Panel title="Recent orders" actions={<Link href="/admin/orders" className="text-sm font-semibold text-brand-700 hover:underline">All orders</Link>}>
          <div className="-m-5 overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead className="border-b border-line">
                <tr>
                  <th scope="col" className={th}>Order</th>
                  <th scope="col" className={th}>Customer</th>
                  <th scope="col" className={th}>Status</th>
                  <th scope="col" className={th}>Payment</th>
                  <th scope="col" className={cn(th, "text-right")}>Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {m.recentOrders.map((order) => (
                  <tr key={order.id}>
                    <td className={td}>
                      <Link href={`/admin/orders/${order.id}`} className="font-mono text-[13px] font-semibold text-brand-700 hover:underline">
                        {order.reference}
                      </Link>
                      <p className="text-xs text-ink-subtle">{formatDateTime(order.createdAt)}</p>
                    </td>
                    <td className={td}>{order.customerName}</td>
                    <td className={td}>
                      <OrderStatusBadge status={order.status} method={order.fulfilmentMethod} />
                    </td>
                    <td className={td}>
                      <PaymentStatusBadge status={order.paymentStatus} method={order.paymentMethod} />
                    </td>
                    <td className={cn(td, "text-right font-semibold tabular-nums")}>{formatMoney(order.totalMinor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Low stock" actions={<Link href="/admin/inventory?low=1" className="text-sm font-semibold text-brand-700 hover:underline">Inventory</Link>}>
          {m.lowStock.length === 0 ? (
            <p className="text-sm text-ink-muted">All products are above their low stock levels.</p>
          ) : (
            <ul className="space-y-2.5 text-sm">
              {m.lowStock.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate">
                    {item.productName} <span className="text-ink-subtle">· {item.variantName}</span>
                  </span>
                  <span className={cn("shrink-0 font-semibold tabular-nums", item.stockMilli === 0 ? "text-danger" : "text-warning")}>
                    {item.stockMilli === 0 ? "Out of stock" : formatQuantity(item.stockMilli, item.unit as SellingUnitCode)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
