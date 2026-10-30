import Link from "next/link";
import { CircleCheck } from "lucide-react";
import { AdminHeader, Panel } from "@/components/admin/ui";
import { differenceSummary } from "@/components/admin/till-parts";
import { TillReviewButton } from "@/components/admin/till-review";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { REFUND_METHOD_TEXT } from "@/lib/pos-returns";
import { formatDateTime } from "@/lib/utils";
import { tillReviewQueue } from "@/server/pos/reports";
import { requireStaffPage } from "@/server/session";

export const metadata = { title: "Till review" };

/** Everything at the till a manager should look at, until they mark it as looked at. */
export default async function TillReviewPage() {
  await requireStaffPage("pos:manage", "/admin/till/review");
  const queue = await tillReviewQueue();

  return (
    <>
      <AdminHeader
        title="Till review"
        description="Counts that did not balance, sales short of stock or charged at another price, voids and refunds. Each stays here until a manager marks it as looked at."
      />
      {queue.count === 0 && queue.removals.length === 0 ? (
        <div className="flex items-center gap-3 rounded-lg border border-line bg-surface p-6 text-sm text-ink-muted">
          <CircleCheck className="h-6 w-6 text-success" aria-hidden="true" /> Nothing needs looking at.
        </div>
      ) : null}

      <div className="space-y-6">
        {queue.shifts.length > 0 ? (
          <Panel title={`Counts that did not balance (${queue.shifts.length})`}>
            <ul className="divide-y divide-line">
              {queue.shifts.map((shift) => (
                <li key={shift.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/admin/till/shifts/${shift.id}`} className="font-semibold text-brand-700 hover:underline">
                      Till {shift.till.code} · {shift.cashier.name}
                    </Link>
                    <p className="text-sm text-ink-muted">
                      Closed {shift.closedAt ? formatDateTime(shift.closedAt) : ""} · <span className="font-semibold text-danger">{shift.difference ? differenceSummary(shift.difference) : ""}</span>
                    </p>
                    {shift.notes ? <p className="text-xs text-ink-subtle">Cashier&apos;s note: {shift.notes}</p> : null}
                  </div>
                  <div className="w-full sm:w-96">
                    <TillReviewButton kind="shift" id={shift.id} />
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}

        {queue.sales.length > 0 ? (
          <Panel title={`Sales to check (${queue.sales.length})`}>
            <ul className="divide-y divide-line">
              {queue.sales.map((sale) => (
                <li key={sale.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <Link href={`/admin/till/sales/${sale.id}`} className="font-mono text-[13px] font-semibold text-brand-700 hover:underline">
                        {sale.receiptNumber}
                      </Link>
                      {sale.status === "VOIDED" ? <Badge tone="danger">Voided</Badge> : null}
                      {sale.hasShortfall ? <Badge tone="warning">Short of stock</Badge> : null}
                      {sale.hasPriceDifference ? <Badge tone="info">Price changed</Badge> : null}
                    </p>
                    <p className="text-sm text-ink-muted">
                      {formatDateTime(sale.soldAt)} · {sale.cashier.name} · {formatMoney(sale.totalMinor)}
                      {sale.status === "VOIDED" ? ` · voided by ${sale.voidedBy?.name ?? "a manager"}${sale.voidReason ? `: ${sale.voidReason}` : ""}` : ""}
                    </p>
                  </div>
                  <div className="w-full sm:w-96">
                    <TillReviewButton kind="sale" id={sale.id} />
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}

        {queue.refunds.length > 0 ? (
          <Panel title={`Refunds (${queue.refunds.length})`}>
            <ul className="divide-y divide-line">
              {queue.refunds.map((refund) => (
                <li key={refund.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                  <div className="min-w-0 flex-1">
                    <p>
                      <span className="font-semibold">{refund.numberLabel}</span> for{" "}
                      <Link href={`/admin/till/sales/${refund.sale.id}`} className="font-mono text-[13px] font-semibold text-brand-700 hover:underline">
                        {refund.sale.receiptNumber}
                      </Link>
                      : {formatMoney(refund.refundMinor)} {REFUND_METHOD_TEXT[refund.method]}
                    </p>
                    <p className="text-sm text-ink-muted">
                      {formatDateTime(refund.createdAt)} · {refund.cashier.name}, approved by {refund.approvedBy.name} · {refund.reason}
                    </p>
                  </div>
                  <div className="w-full sm:w-96">
                    <TillReviewButton kind="return" id={refund.id} />
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}

        {queue.removals.length > 0 ? (
          <Panel title="Removed from a till (last 60 days)">
            <p className="mb-3 text-sm text-ink-muted">
              Things the shop&apos;s system did not accept, removed from a till by a manager. A removed sale was paid for but is not in the sales, so check the money for it.
            </p>
            <ul className="divide-y divide-line text-sm">
              {queue.removals.map((removal) => (
                <li key={removal.id} className="py-2.5">
                  <p className="font-semibold">
                    {removal.kind === "sale" ? `Sale ${removal.receiptNumber ?? ""}` : removal.kind === "shift-open" ? "A shift opening" : "A shift close"}
                    {removal.totalMinor !== null ? ` · ${formatMoney(removal.totalMinor)}` : ""}
                    {removal.tillCode ? ` · Till ${removal.tillCode}` : ""}
                  </p>
                  <p className="text-ink-muted">
                    {formatDateTime(removal.createdAt)} · made by {removal.cashierName ?? "a cashier"}, removal approved by {removal.approvedBy ?? "a manager"}
                    {removal.reason ? ` · ${removal.reason}` : ""}
                  </p>
                  {removal.error ? <p className="text-xs text-ink-subtle">Refused because: {removal.error}</p> : null}
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}
      </div>
    </>
  );
}
