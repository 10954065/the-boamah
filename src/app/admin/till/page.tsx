import Link from "next/link";
import { AdminHeader, Panel, StatCard, TableWrap, td, th } from "@/components/admin/ui";
import { PeriodPicker, periodLabel, periodQuery } from "@/components/admin/till-parts";
import { PrintPageButton } from "@/components/admin/till-review";
import { formatMoney } from "@/lib/money";
import { POS_TENDER_LABELS, POS_TENDERS, type TenderTotals } from "@/lib/pos";
import { reportPeriod } from "@/lib/pos-report";
import { formatQuantity } from "@/lib/quantity";
import { cn, formatDate } from "@/lib/utils";
import { tillReport, tillReviewQueue } from "@/server/pos/reports";
import { requireStaffPage } from "@/server/session";

export const metadata = { title: "Till sales" };

const totalOf = (totals: TenderTotals) => POS_TENDERS.reduce((sum, method) => sum + totals[method], 0);
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** End of day (or any period) report for the in-shop till. */
export default async function TillReportPage({ searchParams }: PageProps<"/admin/till">) {
  await requireStaffPage("pos:manage", "/admin/till");
  const params = await searchParams;
  const now = new Date();
  const period = reportPeriod(params.from, params.to, now);
  const [report, review] = await Promise.all([tillReport(period), tillReviewQueue(now)]);
  const flagged = report.shortfallSales + report.priceDifferenceSales;

  return (
    <>
      <AdminHeader
        title="Till sales"
        description={`${periodLabel(period)}. Takings are sales less refunds; voided sales are not counted.`}
        actions={
          <>
            <PeriodPicker basePath="/admin/till" period={period} now={now} />
            <PrintPageButton />
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Takings" value={formatMoney(totalOf(report.netMinor))} hint="Sales less refunds" tone="brand" />
        <StatCard label="Sales" value={formatMoney(report.salesTotalMinor)} hint={plural(report.salesCount, "sale")} href={`/admin/till/sales?${periodQuery(period)}`} />
        <StatCard label="Refunds" value={formatMoney(totalOf(report.refundedMinor))} hint={plural(report.refundsCount, "refund")} href={`/admin/till/sales?${periodQuery(period, { filter: "returned" })}`} />
        <StatCard label="Voided" value={formatMoney(report.voidedTotalMinor)} hint={`${plural(report.voidsCount, "sale")}, not counted`} href={`/admin/till/sales?${periodQuery(period, { filter: "voided" })}`} />
        <StatCard label="To look at" value={String(review.count)} hint="Flagged sales, refunds and counts that did not balance" tone={review.count > 0 ? "warning" : "neutral"} href="/admin/till/review" />
      </div>

      {flagged > 0 ? (
        <p className="mt-4 rounded-md bg-warning-soft px-4 py-2.5 text-sm text-warning">
          {report.shortfallSales > 0 ? `${plural(report.shortfallSales, "sale")} sold more than the recorded stock. ` : ""}
          {report.priceDifferenceSales > 0 ? `${plural(report.priceDifferenceSales, "sale")} charged at other than the shelf price. ` : ""}
          <Link href={`/admin/till/sales?${periodQuery(period, { filter: "flagged" })}`} className="font-semibold underline">
            See them
          </Link>
        </p>
      ) : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel title="By payment method">
          <TableWrap>
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-soft/60">
                <tr>
                  <th scope="col" className={th}>Method</th>
                  <th scope="col" className={cn(th, "text-right")}>Taken</th>
                  <th scope="col" className={cn(th, "text-right")}>Refunded</th>
                  <th scope="col" className={cn(th, "text-right")}>Takings</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {POS_TENDERS.map((method) => (
                  <tr key={method}>
                    <th scope="row" className={cn(td, "text-left font-semibold")}>{POS_TENDER_LABELS[method]}</th>
                    <td className={cn(td, "text-right tabular-nums")}>{formatMoney(report.takenMinor[method])}</td>
                    <td className={cn(td, "text-right tabular-nums")}>{formatMoney(report.refundedMinor[method])}</td>
                    <td className={cn(td, "text-right font-semibold tabular-nums")}>{formatMoney(report.netMinor[method])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <p className="mt-2 text-xs text-ink-muted">Cash is after the change given back. Each shift&apos;s own count is under Till shifts.</p>
        </Panel>

        <Panel title="By cashier">
          {report.byCashier.length === 0 ? (
            <p className="text-sm text-ink-muted">No till sales in this period.</p>
          ) : (
            <TableWrap>
              <table className="w-full text-sm">
                <thead className="border-b border-line bg-soft/60">
                  <tr>
                    <th scope="col" className={th}>Cashier</th>
                    <th scope="col" className={cn(th, "text-right")}>Sales</th>
                    <th scope="col" className={cn(th, "text-right")}>Refunded</th>
                    <th scope="col" className={cn(th, "text-right")}>Voids</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {report.byCashier.map((cashier) => (
                    <tr key={cashier.id}>
                      <th scope="row" className={cn(td, "text-left font-semibold")}>{cashier.name}</th>
                      <td className={cn(td, "text-right tabular-nums")}>
                        {formatMoney(cashier.salesTotalMinor)} <span className="text-xs text-ink-subtle">({cashier.salesCount})</span>
                      </td>
                      <td className={cn(td, "text-right tabular-nums")}>{formatMoney(cashier.refundedMinor)}</td>
                      <td className={cn(td, "text-right tabular-nums")}>{cashier.voidsCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Panel>

        <Panel title="Best sellers at the till">
          {report.topProducts.length === 0 ? (
            <p className="text-sm text-ink-muted">No till sales in this period.</p>
          ) : (
            <TableWrap>
              <table className="w-full text-sm">
                <thead className="border-b border-line bg-soft/60">
                  <tr>
                    <th scope="col" className={th}>Product</th>
                    <th scope="col" className={cn(th, "text-right")}>Sold</th>
                    <th scope="col" className={cn(th, "text-right")}>Sales</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {report.topProducts.map((product) => (
                    <tr key={`${product.productName}-${product.variantName}`}>
                      <td className={td}>
                        <p className="font-semibold">{product.productName}</p>
                        <p className="text-xs text-ink-subtle">{product.variantName}</p>
                      </td>
                      <td className={cn(td, "text-right tabular-nums")}>
                        {formatQuantity(product.quantityMilli, product.unit)}
                        {product.returnedMilli > 0 ? <span className="block text-xs text-ink-subtle">{formatQuantity(product.returnedMilli, product.unit)} back</span> : null}
                      </td>
                      <td className={cn(td, "text-right font-semibold tabular-nums")}>{formatMoney(product.revenueMinor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Panel>

        {period.days > 1 ? (
          <Panel title="Day by day">
            {report.daily.length === 0 ? (
              <p className="text-sm text-ink-muted">No till sales in this period.</p>
            ) : (
              <TableWrap>
                <table className="w-full text-sm">
                  <thead className="border-b border-line bg-soft/60">
                    <tr>
                      <th scope="col" className={th}>Day</th>
                      <th scope="col" className={cn(th, "text-right")}>Sales</th>
                      <th scope="col" className={cn(th, "text-right")}>Refunded</th>
                      <th scope="col" className={cn(th, "text-right")}>Takings</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {report.daily.map((day) => (
                      <tr key={day.day}>
                        <th scope="row" className={cn(td, "text-left font-semibold")}>
                          <Link href={`/admin/till?${new URLSearchParams({ from: day.day, to: day.day })}`} className="text-brand-700 hover:underline">
                            {formatDate(`${day.day}T12:00:00Z`)}
                          </Link>
                        </th>
                        <td className={cn(td, "text-right tabular-nums")}>
                          {formatMoney(day.salesTotalMinor)} <span className="text-xs text-ink-subtle">({day.salesCount})</span>
                        </td>
                        <td className={cn(td, "text-right tabular-nums")}>{formatMoney(day.refundedMinor)}</td>
                        <td className={cn(td, "text-right font-semibold tabular-nums")}>{formatMoney(day.salesTotalMinor - day.refundedMinor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </Panel>
        ) : null}
      </div>

      <p className="mt-6 text-sm print:hidden">
        <Link href={`/admin/till/sales?${periodQuery(period)}`} className="font-semibold text-brand-700 hover:underline">
          See every sale in this period
        </Link>
      </p>
    </>
  );
}
