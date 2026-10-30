import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminHeader, Panel, TableWrap, td, th } from "@/components/admin/ui";
import { differenceClass, differenceText, TillSaleBadges } from "@/components/admin/till-parts";
import { PrintPageButton, TillReviewButton } from "@/components/admin/till-review";
import { formatMoney } from "@/lib/money";
import { POS_TENDER_LABELS, POS_TENDERS } from "@/lib/pos";
import { cn, formatDateTime } from "@/lib/utils";
import { hasDifference, tillShiftDetail } from "@/server/pos/reports";
import { requireStaffPage } from "@/server/session";

export const metadata = { title: "Till shift" };

export default async function TillShiftPage({ params }: PageProps<"/admin/till/shifts/[id]">) {
  const { id } = await params;
  await requireStaffPage("pos:manage", `/admin/till/shifts/${id}`);
  const detail = await tillShiftDetail(id);
  if (!detail) notFound();
  const { shift, sales, refunds } = detail;
  const { summary } = shift;

  return (
    <>
      <AdminHeader
        title={`Till ${shift.till.code} · ${shift.cashier.name}`}
        description={`Opened ${formatDateTime(shift.openedAt)} with a float of ${formatMoney(shift.openingFloatMinor)}${shift.closedAt ? `, closed ${formatDateTime(shift.closedAt)}` : ", still open"}.`}
        actions={<PrintPageButton />}
      />

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Panel title="Expected against counted">
          <p className="mb-3 text-sm text-ink-muted">
            {summary.salesCount} sale{summary.salesCount === 1 ? "" : "s"} for {formatMoney(summary.salesTotalMinor)}
            {summary.refundsCount > 0 ? `; ${summary.refundsCount} refund${summary.refundsCount === 1 ? "" : "s"} taken off` : ""}
            {summary.voidsCount > 0 ? `; ${summary.voidsCount} voided (${formatMoney(summary.voidedTotalMinor)}), not counted` : ""}.
          </p>
          <TableWrap>
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-soft/60">
                <tr>
                  <th scope="col" className={th}>Method</th>
                  <th scope="col" className={cn(th, "text-right")}>Taken</th>
                  <th scope="col" className={cn(th, "text-right")}>Refunded</th>
                  <th scope="col" className={cn(th, "text-right")}>Expected</th>
                  <th scope="col" className={cn(th, "text-right")}>Counted</th>
                  <th scope="col" className={cn(th, "text-right")}>Difference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {POS_TENDERS.map((method) => (
                  <tr key={method}>
                    <th scope="row" className={cn(td, "text-left font-semibold")}>
                      {POS_TENDER_LABELS[method]}
                      {method === "CASH" ? <span className="block text-xs font-normal text-ink-subtle">Expected includes the float</span> : null}
                    </th>
                    <td className={cn(td, "text-right tabular-nums")}>{formatMoney(summary.takenMinor[method])}</td>
                    <td className={cn(td, "text-right tabular-nums")}>{formatMoney(summary.refundedMinor[method])}</td>
                    <td className={cn(td, "text-right tabular-nums")}>{formatMoney(summary.expectedMinor[method])}</td>
                    <td className={cn(td, "text-right tabular-nums")}>{shift.counted ? formatMoney(shift.counted[method]) : "Not yet"}</td>
                    <td className={cn(td, "text-right font-semibold tabular-nums", shift.difference && differenceClass(shift.difference[method]))}>
                      {shift.difference ? differenceText(shift.difference[method]) : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          {shift.notes ? <p className="mt-3 text-sm">Cashier&apos;s note: {shift.notes}</p> : null}
        </Panel>

        <Panel title="Manager review">
          {shift.reviewedAt ? (
            <p className="text-sm">
              Looked at by {shift.reviewedBy?.name ?? "a manager"} on {formatDateTime(shift.reviewedAt)}
              {shift.reviewNote ? `: ${shift.reviewNote}` : "."}
            </p>
          ) : !shift.closedAt ? (
            <p className="text-sm text-ink-muted">The shift is still open.</p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-ink-muted">
                {hasDifference(shift) ? "The count did not balance. Find out why, then note it here." : "The count balanced. Mark it as looked at if you have checked it."}
              </p>
              <TillReviewButton kind="shift" id={shift.id} />
            </div>
          )}
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel title="Sales">
          {sales.length === 0 ? (
            <p className="text-sm text-ink-muted">No sales in this shift.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {sales.map((sale) => (
                <li key={sale.id} className="flex flex-wrap items-center gap-2 py-2">
                  <Link href={`/admin/till/sales/${sale.id}`} className="font-mono text-[13px] font-semibold text-brand-700 hover:underline">
                    {sale.receiptNumber}
                  </Link>
                  <span className="text-ink-muted">{formatDateTime(sale.soldAt)}</span>
                  <TillSaleBadges sale={sale} />
                  <span className={cn("ml-auto font-semibold tabular-nums", sale.status === "VOIDED" && "text-ink-subtle line-through")}>{formatMoney(sale.totalMinor)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Refunds paid out">
          {refunds.length === 0 ? (
            <p className="text-sm text-ink-muted">No refunds in this shift.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {refunds.map((refund) => (
                <li key={refund.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="font-semibold">{refund.numberLabel}</span>
                  <span className="text-ink-muted">
                    for{" "}
                    <Link href={`/admin/till/sales/${refund.sale.id}`} className="text-brand-700 hover:underline">
                      {refund.sale.receiptNumber}
                    </Link>{" "}
                    by {POS_TENDER_LABELS[refund.method].toLowerCase()}, approved by {refund.approvedBy.name}
                  </span>
                  <span className="ml-auto font-semibold tabular-nums">{formatMoney(refund.refundMinor)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
