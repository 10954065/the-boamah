import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { AdminHeader, EmptyRow, TableWrap, td, th } from "@/components/admin/ui";
import { differenceSummary, FilterChips } from "@/components/admin/till-parts";
import { Pagination } from "@/components/ui/pagination";
import { formatMoney } from "@/lib/money";
import { POS_TENDERS } from "@/lib/pos";
import { cn, formatDateTime } from "@/lib/utils";
import { hasDifference, SHIFT_FILTERS, tillShifts, type ShiftFilter } from "@/server/pos/reports";
import { requireStaffPage } from "@/server/session";

export const metadata = { title: "Till shifts" };
const PAGE_SIZE = 25;

export default async function TillShiftsPage({ searchParams }: PageProps<"/admin/till/shifts">) {
  await requireStaffPage("pos:manage", "/admin/till/shifts");
  const params = await searchParams;
  const filter = (Object.keys(SHIFT_FILTERS) as ShiftFilter[]).find((key) => key === params.filter) ?? "all";
  const page = Math.max(1, Number.parseInt(typeof params.page === "string" ? params.page : "1", 10) || 1);
  const { rows, total } = await tillShifts(filter, page, PAGE_SIZE);

  return (
    <>
      <AdminHeader title="Till shifts" description="Each shift's sales and refunds against what the cashier counted at the end." />
      <FilterChips basePath="/admin/till/shifts" filters={SHIFT_FILTERS} current={filter} query={{}} />
      <TableWrap>
        <table className="w-full min-w-[860px] text-sm">
          <thead className="border-b border-line bg-soft/60">
            <tr>
              <th scope="col" className={th}>Shift</th>
              <th scope="col" className={th}>Opened</th>
              <th scope="col" className={th}>Closed</th>
              <th scope="col" className={cn(th, "text-right")}>Sales</th>
              <th scope="col" className={cn(th, "text-right")}>Refunded</th>
              <th scope="col" className={th}>Count</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.length === 0 ? <EmptyRow colSpan={6}>No shifts match.</EmptyRow> : null}
            {rows.map((shift) => {
              const refunded = POS_TENDERS.reduce((sum, method) => sum + shift.summary.refundedMinor[method], 0);
              return (
                <tr key={shift.id} className="hover:bg-soft/40">
                  <td className={td}>
                    <Link href={`/admin/till/shifts/${shift.id}`} className="font-semibold text-brand-700 hover:underline">
                      Till {shift.till.code} · {shift.cashier.name}
                    </Link>
                  </td>
                  <td className={cn(td, "whitespace-nowrap text-ink-muted")}>{formatDateTime(shift.openedAt)}</td>
                  <td className={cn(td, "whitespace-nowrap text-ink-muted")}>{shift.closedAt ? formatDateTime(shift.closedAt) : <Badge tone="brand">Open</Badge>}</td>
                  <td className={cn(td, "text-right tabular-nums")}>
                    {formatMoney(shift.summary.salesTotalMinor)} <span className="text-xs text-ink-subtle">({shift.summary.salesCount})</span>
                  </td>
                  <td className={cn(td, "text-right tabular-nums")}>{formatMoney(refunded)}</td>
                  <td className={td}>
                    {shift.difference ? (
                      <span className={cn("font-semibold", hasDifference(shift) ? "text-danger" : "text-success")}>{differenceSummary(shift.difference)}</span>
                    ) : (
                      <span className="text-ink-subtle">Not counted yet</span>
                    )}
                    {shift.reviewedAt ? (
                      <Badge tone="success" className="ml-2">
                        Looked at
                      </Badge>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableWrap>
      <Pagination className="mt-6" page={page} totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))} hrefFor={(n) => `/admin/till/shifts?${new URLSearchParams({ filter, page: String(n) })}`} />
    </>
  );
}
