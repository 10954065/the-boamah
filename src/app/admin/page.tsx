import Link from "next/link";
import { AttentionList, BestSellers, KpiStrip, KpiTile, LowStockList, MoneyMix, OrderPipeline, TodayStrip, type AttentionItem } from "@/components/admin/dashboard/parts";
import { SalesChart } from "@/components/admin/dashboard/sales-chart";
import { AdminHeader, OrderStatusBadge, Panel, PaymentStatusBadge, segmentGroup, segmentItem, td, th } from "@/components/admin/ui";
import { longDay, periodChange } from "@/lib/dashboard";
import { formatMoney } from "@/lib/money";
import { hasPermission } from "@/lib/permissions";
import { dayString } from "@/lib/pos-report";
import { cn, formatDateTime } from "@/lib/utils";
import { getDashboardMetrics } from "@/server/admin-metrics";
import { creditTotals } from "@/server/credit";
import { tillReviewCount, tillSalesByDay, tillTakingsSince } from "@/server/pos/reports";
import { pendingReviewCount } from "@/server/reviews";
import { requireStaffPage } from "@/server/session";

export const metadata = { title: "Dashboard" };

const RANGES = [7, 30, 90] as const;
const DAY_MS = 86_400_000;

async function tillFigures(since: Date, now: Date, days: number) {
  const before = new Date(since.getTime() - days * DAY_MS);
  const [current, previous, byDay, toReview] = await Promise.all([tillTakingsSince(since), tillTakingsSince(before, since), tillSalesByDay(since), tillReviewCount()]);
  return {
    takingsMinor: current.salesTotalMinor - current.refundedMinor,
    previousMinor: previous.salesTotalMinor - previous.refundedMinor,
    salesCount: current.salesCount,
    byDay,
    toReview,
    period: new URLSearchParams({ from: dayString(since), to: dayString(now) }),
  };
}

export default async function AdminDashboard({ searchParams }: PageProps<"/admin">) {
  const user = await requireStaffPage("dashboard:view");
  const params = await searchParams;
  const days = RANGES.find((r) => String(r) === params.days) ?? 30;
  const showTill = hasPermission(user.role, "pos:manage");
  const now = new Date();
  const since = new Date(now.getTime() - days * DAY_MS);
  const [m, till, reviewsToCheck, owedOnCredit] = await Promise.all([
    getDashboardMetrics(days, now),
    showTill ? tillFigures(since, now, days) : null,
    hasPermission(user.role, "reviews:manage") ? pendingReviewCount() : null,
    hasPermission(user.role, "credit:manage") ? creditTotals() : null,
  ]);

  const daily = m.daily.map((day) => ({ day: day.day, websiteMinor: day.paidMinor, tillMinor: till?.byDay.get(day.day) ?? 0, orders: day.orders }));
  const today = daily.at(-1);
  const salesMinor = m.paidRevenueMinor + (till?.takingsMinor ?? 0);
  const previousSalesMinor = m.previous.paidRevenueMinor + (till?.previousMinor ?? 0);
  const averageMinor = m.paidOrders ? Math.round(m.paidRevenueMinor / m.paidOrders) : 0;
  const previousAverageMinor = m.previous.paidOrders ? Math.round(m.previous.paidRevenueMinor / m.previous.paidOrders) : 0;
  const compared = `the ${days} days before`;
  const toPack = m.pipeline.CONFIRMED + m.pipeline.PROCESSING;

  const attention: AttentionItem[] = [
    { label: "Orders to pack", detail: `${m.pipeline.CONFIRMED} new, ${m.pipeline.PROCESSING} being packed`, count: toPack, tone: "warning", href: "/admin/orders?status=CONFIRMED" },
    {
      label: "Cash on delivery to collect",
      detail: `${formatMoney(m.codOutstanding.amountMinor)} still to come in`,
      count: m.codOutstanding.count,
      tone: "warning",
      href: "/admin/orders?payment=UNPAID",
    },
    {
      label: "Waiting for online payment",
      detail: `${formatMoney(m.pendingOnline.amountMinor)}, not counted as sales`,
      count: m.pendingOnline.count,
      tone: "plain",
      href: "/admin/orders?status=PENDING_PAYMENT",
    },
    { label: "Low stock", detail: "At or below their alert level", count: m.lowStock.length, tone: "danger", href: "/admin/inventory?low=1" },
    ...(till ? [{ label: "Till to review", detail: "Voids, refunds and counts that differ", count: till.toReview, tone: "plain" as const, href: "/admin/till/review" }] : []),
    ...(reviewsToCheck !== null
      ? [{ label: "Reviews to check", detail: "From customers' delivered orders", count: reviewsToCheck, tone: "plain" as const, href: "/admin/reviews" }]
      : []),
    ...(owedOnCredit !== null
      ? [
          {
            label: "Owed on credit",
            detail: `${formatMoney(owedOnCredit.owedMinor)} from credit customers`,
            count: owedOnCredit.customersOwing,
            tone: "warning" as const,
            href: "/admin/credit",
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div>
        <AdminHeader title="Dashboard" description={longDay(now)} />
        <TodayStrip
          figures={[
            { label: "Sold today", value: formatMoney((today?.websiteMinor ?? 0) + (today?.tillMinor ?? 0)) },
            { label: "Orders today", value: String(today?.orders ?? 0) },
            { label: "To pack now", value: String(toPack) },
            till ? { label: "Till today", value: formatMoney(today?.tillMinor ?? 0) } : { label: "Low stock", value: String(m.lowStock.length) },
          ]}
        />
      </div>

      <section aria-labelledby="period-title" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="period-title" className="text-[17px] font-bold">
            Last {days} days
          </h2>
          <nav aria-label="Date range" className={segmentGroup}>
            {RANGES.map((range) => (
              <Link key={range} href={`/admin?days=${range}`} aria-current={range === days ? "true" : undefined} className={segmentItem(range === days)}>
                {range} days
              </Link>
            ))}
          </nav>
        </div>
        <KpiStrip>
          <KpiTile
            label={till ? "Total sales" : "Paid sales"}
            value={formatMoney(salesMinor)}
            change={periodChange(salesMinor, previousSalesMinor)}
            compared={compared}
            trend={daily.map((day) => day.websiteMinor + day.tillMinor)}
          />
          <KpiTile
            label="Website orders"
            value={String(m.totalOrders)}
            change={periodChange(m.totalOrders, m.previous.totalOrders)}
            compared={compared}
            trend={daily.map((day) => day.orders)}
            href="/admin/orders"
          />
          <KpiTile
            label="Average paid order"
            value={formatMoney(averageMinor)}
            change={periodChange(averageMinor, previousAverageMinor)}
            compared={compared}
            hint={`${m.paidOrders} paid, ${m.completedOrders} delivered or collected`}
          />
          {till ? (
            <KpiTile
              label="Shop till takings"
              value={formatMoney(till.takingsMinor)}
              change={periodChange(till.takingsMinor, till.previousMinor)}
              compared={compared}
              trend={daily.map((day) => day.tillMinor)}
              trendTone="gold"
              href={`/admin/till?${till.period}`}
            />
          ) : (
            <KpiTile label="Customers" value={String(m.customers)} hint="People who have ordered, from checkout details" href="/admin/customers" />
          )}
        </KpiStrip>
        <p className="text-[13px] text-ink-muted">Sales count verified payments only. Unpaid orders are listed apart.</p>
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        <Panel title="Sales per day" description={till ? "Website orders paid and till sales, before refunds" : "Website orders paid"} className="xl:col-span-2">
          <SalesChart days={daily} showTill={Boolean(till)} />
        </Panel>
        <Panel title="Needs your attention">
          <AttentionList items={attention} />
        </Panel>
      </div>

      <Panel title="Website orders in the shop" description="Every open order, whenever it was placed" actions={<PanelLink href="/admin/orders">All orders</PanelLink>} flush>
        <OrderPipeline
          stages={[
            { label: "To pack", detail: "Paid or cash on delivery", count: m.pipeline.CONFIRMED, href: "/admin/orders?status=CONFIRMED" },
            { label: "Packing", detail: "Being put together", count: m.pipeline.PROCESSING, href: "/admin/orders?status=PROCESSING" },
            { label: "Ready", detail: "For pickup or a rider", count: m.pipeline.READY, href: "/admin/orders?status=READY" },
            { label: "On the road", detail: "With the rider", count: m.pipeline.OUT_FOR_DELIVERY, href: "/admin/orders?status=OUT_FOR_DELIVERY" },
          ]}
          footnote={
            m.pipeline.PENDING_PAYMENT
              ? `${m.pipeline.PENDING_PAYMENT} more ${m.pipeline.PENDING_PAYMENT === 1 ? "is" : "are"} waiting for online payment before packing.`
              : undefined
          }
        />
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <Panel title="Where the money came from" description={till ? "Till after refunds" : undefined}>
          {/* Cash on delivery, online, till: the order these colours were checked in for colour blindness. */}
          <MoneyMix
            parts={[
              { label: "Cash on delivery", minor: m.paidByMethod.cashOnDeliveryMinor, swatch: "bg-leaf-400" },
              { label: "Paid online", minor: m.paidByMethod.onlineMinor, swatch: "bg-brand-500" },
              ...(till ? [{ label: "Shop till", minor: till.takingsMinor, swatch: "bg-gold-500" }] : []),
            ]}
          />
        </Panel>
        <Panel title="Best sellers" description="Website orders">
          <BestSellers items={m.bestSellers} />
        </Panel>
        <Panel title="Low stock" actions={<PanelLink href="/admin/inventory?low=1">Inventory</PanelLink>}>
          <LowStockList items={m.lowStock} />
        </Panel>
      </div>

      <Panel title="Recent orders" actions={<PanelLink href="/admin/orders">All orders</PanelLink>} flush>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-line bg-soft/60">
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
                <tr key={order.id} className="transition-colors hover:bg-soft/50">
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
    </div>
  );
}

function PanelLink({ href, children }: { href: string; children: string }) {
  return (
    <Link href={href} className="rounded-md px-2 py-1 text-[13px] font-semibold text-brand-700 transition-colors hover:bg-brand-50">
      {children}
    </Link>
  );
}
