import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminHeader, Panel, TableWrap, td, th } from "@/components/admin/ui";
import { TillSaleBadges } from "@/components/admin/till-parts";
import { TillReviewButton } from "@/components/admin/till-review";
import { formatMoney } from "@/lib/money";
import { SALE_TENDER_LABELS } from "@/lib/pos";
import { formatRefundNumber, REFUND_METHOD_TEXT } from "@/lib/pos-returns";
import { formatQuantity, milliToDecimalString, type SellingUnitCode } from "@/lib/quantity";
import { cn, formatDateTime } from "@/lib/utils";
import { tillSaleDetail } from "@/server/pos/reports";
import { requireStaffPage } from "@/server/session";

export const metadata = { title: "Till sale" };

const MOVEMENT_LABELS: Record<string, string> = { POS_SALE: "Sold", POS_VOID: "Back from the void", POS_RETURN: "Back from a return" };

export default async function TillSalePage({ params }: PageProps<"/admin/till/sales/[id]">) {
  const { id } = await params;
  await requireStaffPage("pos:manage", `/admin/till/sales/${id}`);
  const sale = await tillSaleDetail(id);
  if (!sale) notFound();
  const needsReview = !sale.reviewedAt && (sale.hasShortfall || sale.hasPriceDifference || sale.status === "VOIDED");
  // Stock taken by the sale or the void, and put back by its returns.
  const movements = [...sale.movements, ...sale.returns.flatMap((refund) => refund.movements)].toSorted((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  return (
    <>
      <AdminHeader
        title={`Receipt ${sale.receiptNumber}`}
        description={
          <>
            Till {sale.till.code} · {sale.cashier.name} · sold {formatDateTime(sale.soldAt)} (till clock) · reached the shop&apos;s system {formatDateTime(sale.syncedAt)}
            {sale.shift ? (
              <>
                {" · "}
                <Link href={`/admin/till/shifts/${sale.shift.id}`} className="text-brand-700 hover:underline">
                  the shift
                </Link>
              </>
            ) : null}
          </>
        }
        actions={<TillSaleBadges sale={sale} />}
      />

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          <Panel title="Items">
            <TableWrap>
              <table className="w-full min-w-[620px] text-sm">
                <thead className="border-b border-line bg-soft/60">
                  <tr>
                    <th scope="col" className={th}>Item</th>
                    <th scope="col" className={cn(th, "text-right")}>Quantity</th>
                    <th scope="col" className={cn(th, "text-right")}>Charged</th>
                    <th scope="col" className={cn(th, "text-right")}>Shelf price</th>
                    <th scope="col" className={cn(th, "text-right")}>Line</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {sale.items.map((item) => {
                    const unit = item.unit as SellingUnitCode;
                    return (
                      <tr key={item.id}>
                        <td className={td}>
                          <p className="font-semibold">{item.productName}</p>
                          <p className="text-xs text-ink-subtle">
                            {item.variantName} · {item.sku}
                          </p>
                          {item.shortfallMilli > 0 ? <p className="text-xs text-warning">{formatQuantity(item.shortfallMilli, unit)} more than the recorded stock</p> : null}
                          {item.returnedMilli > 0 ? (
                            <p className="text-xs text-gold-700">
                              {formatQuantity(item.returnedMilli, unit)} returned, {formatMoney(item.refundedMinor)} refunded
                            </p>
                          ) : null}
                        </td>
                        <td className={cn(td, "text-right tabular-nums")}>{milliToDecimalString(item.quantityMilli)}</td>
                        <td className={cn(td, "text-right tabular-nums", item.unitPriceMinor !== item.listUnitPriceMinor && "font-semibold text-warning")}>{formatMoney(item.unitPriceMinor)}</td>
                        <td className={cn(td, "text-right tabular-nums text-ink-muted")}>{formatMoney(item.listUnitPriceMinor)}</td>
                        <td className={cn(td, "text-right font-semibold tabular-nums")}>{formatMoney(item.lineTotalMinor)}</td>
                      </tr>
                    );
                  })}
                  <tr>
                    <th scope="row" colSpan={4} className={cn(td, "text-right")}>
                      Total
                    </th>
                    <td className={cn(td, "text-right font-bold tabular-nums")}>{formatMoney(sale.totalMinor)}</td>
                  </tr>
                </tbody>
              </table>
            </TableWrap>
          </Panel>

          {sale.returns.length > 0 ? (
            <Panel title="Returns">
              <ul className="space-y-4">
                {sale.returns.map((refund) => (
                  <li key={refund.id} className="rounded-md border border-line p-3 text-sm">
                    <p className="font-semibold">
                      {formatRefundNumber(refund.number)}: {formatMoney(refund.refundMinor)} {REFUND_METHOD_TEXT[refund.method]}
                      {refund.reference ? ` (ref ${refund.reference})` : ""}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {formatDateTime(refund.createdAt)} · {refund.cashier.name} at the till, approved by {refund.approvedBy.name} · {refund.reason}
                    </p>
                    <ul className="mt-2 space-y-0.5 text-ink-muted">
                      {refund.items.map((item) => (
                        <li key={item.id}>
                          {item.saleItem.productName} ({item.saleItem.variantName}): {formatQuantity(item.quantityMilli, item.saleItem.unit as SellingUnitCode)},{" "}
                          {formatMoney(item.refundMinor)}, {item.restocked ? "back on the shelf" : "not fit to sell again"}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          <Panel title="Stock">
            {movements.length === 0 ? (
              <p className="text-sm text-ink-muted">No stock changes were recorded for this sale.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {movements.map((movement) => (
                  <li key={movement.id} className="flex justify-between gap-3 py-2">
                    <span>
                      {MOVEMENT_LABELS[movement.type] ?? movement.type}: {movement.variant.product.name} ({movement.variant.name})
                    </span>
                    <span className="shrink-0 tabular-nums text-ink-muted">
                      {movement.deltaMilli > 0 ? "+" : ""}
                      {milliToDecimalString(movement.deltaMilli)}, leaving {milliToDecimalString(movement.balanceAfterMilli)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Payment">
            <ul className="space-y-1 text-sm">
              {sale.payments.map((payment) => (
                <li key={payment.id} className="flex justify-between gap-2">
                  <span>
                    {SALE_TENDER_LABELS[payment.method]}
                    {payment.reference ? <span className="text-ink-muted"> · ref {payment.reference}</span> : null}
                  </span>
                  <span className="tabular-nums">{formatMoney(payment.amountMinor)}</span>
                </li>
              ))}
              {sale.changeMinor > 0 ? (
                <li className="flex justify-between gap-2 text-ink-muted">
                  <span>Change given</span>
                  <span className="tabular-nums">{formatMoney(sale.changeMinor)}</span>
                </li>
              ) : null}
            </ul>
          </Panel>

          {sale.voidedAt ? (
            <Panel title="Voided">
              <p className="text-sm">
                {formatDateTime(sale.voidedAt)}, approved by {sale.voidedBy?.name ?? "a manager"}.
              </p>
              {sale.voidReason ? <p className="mt-1 text-sm text-ink-muted">{sale.voidReason}</p> : null}
            </Panel>
          ) : null}

          <Panel title="Manager review">
            {sale.reviewedAt ? (
              <p className="text-sm">
                Looked at by {sale.reviewedBy?.name ?? "a manager"} on {formatDateTime(sale.reviewedAt)}
                {sale.reviewNote ? `: ${sale.reviewNote}` : "."}
              </p>
            ) : needsReview ? (
              <div className="space-y-3">
                <p className="text-sm text-ink-muted">
                  {sale.status === "VOIDED"
                    ? "Voided sales are listed for a manager to look at."
                    : "This sale sold more than the recorded stock or was charged at other than the shelf price. Check it, then mark it as looked at."}
                </p>
                <TillReviewButton kind="sale" id={sale.id} />
              </div>
            ) : (
              <p className="text-sm text-ink-muted">Nothing on this sale needs looking at.</p>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
