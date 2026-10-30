import Link from "next/link";
import { AdminHeader, EmptyRow, TableWrap, td, th } from "@/components/admin/ui";
import { FilterChips, PeriodPicker, periodLabel, TillSaleBadges } from "@/components/admin/till-parts";
import { Pagination } from "@/components/ui/pagination";
import { formatMoney } from "@/lib/money";
import { SALE_TENDER_LABELS } from "@/lib/pos";
import { reportPeriod } from "@/lib/pos-report";
import { cn, formatDateTime } from "@/lib/utils";
import { SALE_FILTERS, tillSales, type SaleFilter } from "@/server/pos/reports";
import { requireStaffPage } from "@/server/session";

export const metadata = { title: "Till sales list" };
const PAGE_SIZE = 30;

export default async function TillSalesPage({ searchParams }: PageProps<"/admin/till/sales">) {
  await requireStaffPage("pos:manage", "/admin/till/sales");
  const params = await searchParams;
  const now = new Date();
  const period = reportPeriod(params.from, params.to, now);
  const filter = (Object.keys(SALE_FILTERS) as SaleFilter[]).find((key) => key === params.filter) ?? "all";
  const page = Math.max(1, Number.parseInt(typeof params.page === "string" ? params.page : "1", 10) || 1);
  const { rows, total } = await tillSales(period, filter, page, PAGE_SIZE);
  const query = { from: period.from, to: period.to, filter };

  return (
    <>
      <AdminHeader
        title="Till sales list"
        description={`${periodLabel(period)}: ${total} sale${total === 1 ? "" : "s"}.`}
        actions={<PeriodPicker basePath="/admin/till/sales" period={period} now={now} extra={{ filter }} />}
      />
      <FilterChips basePath="/admin/till/sales" filters={SALE_FILTERS} current={filter} query={{ from: period.from, to: period.to }} />
      <TableWrap>
        <table className="w-full min-w-[820px] text-sm">
          <thead className="border-b border-line bg-soft/60">
            <tr>
              <th scope="col" className={th}>Receipt</th>
              <th scope="col" className={th}>Sold</th>
              <th scope="col" className={th}>Cashier</th>
              <th scope="col" className={th}>Paid by</th>
              <th scope="col" className={th}>Notes</th>
              <th scope="col" className={cn(th, "text-right")}>Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.length === 0 ? <EmptyRow colSpan={6}>No till sales match.</EmptyRow> : null}
            {rows.map((sale) => (
              <tr key={sale.id} className="hover:bg-soft/40">
                <td className={td}>
                  <Link href={`/admin/till/sales/${sale.id}`} className="font-mono text-[13px] font-semibold text-brand-700 hover:underline">
                    {sale.receiptNumber}
                  </Link>
                </td>
                <td className={cn(td, "whitespace-nowrap text-ink-muted")}>{formatDateTime(sale.soldAt)}</td>
                <td className={td}>{sale.cashier.name}</td>
                <td className={td}>{[...new Set(sale.payments.map((p) => SALE_TENDER_LABELS[p.method]))].join(" + ")}</td>
                <td className={td}>
                  <TillSaleBadges sale={sale} />
                </td>
                <td className={cn(td, "text-right font-semibold tabular-nums", sale.status === "VOIDED" && "text-ink-subtle line-through")}>{formatMoney(sale.totalMinor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <Pagination className="mt-6" page={page} totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))} hrefFor={(n) => `/admin/till/sales?${new URLSearchParams({ ...query, page: String(n) })}`} />
    </>
  );
}
