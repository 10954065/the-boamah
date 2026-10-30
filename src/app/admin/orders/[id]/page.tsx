import Link from "next/link";
import { notFound } from "next/navigation";
import { CashCollectionForm, OrderNoteForm, OrderStatusControl } from "@/components/admin/order-controls";
import { AdminHeader, OrderStatusBadge, Panel, PaymentStatusBadge } from "@/components/admin/ui";
import { prisma } from "@/lib/db";
import { formatMoney, minorToDecimalString } from "@/lib/money";
import { allowedNextStatuses, statusLabel } from "@/lib/order-status";
import { hasPermission } from "@/lib/permissions";
import { formatQuantity, type SellingUnitCode } from "@/lib/quantity";
import { formatDateTime } from "@/lib/utils";
import { customerKey } from "@/server/customers";
import { requireStaffPage } from "@/server/session";

export const metadata = { title: "Order" };

export default async function AdminOrderPage({ params }: PageProps<"/admin/orders/[id]">) {
  const { id } = await params;
  const user = await requireStaffPage("orders:view", `/admin/orders/${id}`);
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: true,
      payments: { orderBy: { createdAt: "desc" }, include: { recordedBy: { select: { name: true } } } },
      statusHistory: { orderBy: { createdAt: "asc" }, include: { actor: { select: { name: true } } } },
      notes: { orderBy: { createdAt: "desc" }, include: { author: { select: { name: true } } } },
    },
  });
  if (!order) notFound();

  const canUpdate = hasPermission(user.role, "orders:update");
  const canCancel = hasPermission(user.role, "orders:cancel");
  const next = allowedNextStatuses(order.status, order).filter((s) => (s === "CANCELLED" ? canCancel : canUpdate));
  const canRecordCash =
    hasPermission(user.role, "payments:record") && order.paymentMethod === "CASH_ON_DELIVERY" && order.paymentStatus === "UNPAID" && order.status !== "CANCELLED";

  return (
    <>
      <Link href="/admin/orders" className="text-sm font-medium text-brand-700 hover:underline">← Orders</Link>
      <div className="mt-2">
        <AdminHeader
          title={`Order ${order.reference}`}
          description={`Placed ${formatDateTime(order.createdAt)}`}
          actions={
            <div className="flex items-center gap-2">
              <OrderStatusBadge status={order.status} method={order.fulfilmentMethod} />
              <PaymentStatusBadge status={order.paymentStatus} method={order.paymentMethod} />
            </div>
          }
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <Panel title="Items">
            <ul className="divide-y divide-line text-sm">
              {order.items.map((item) => (
                <li key={item.id} className="flex justify-between gap-3 py-2.5">
                  <span>
                    <span className="font-medium">{item.productName}</span>
                    <span className="text-ink-muted">
                      {" "}
                      · {item.variantName} · {formatQuantity(item.quantityMilli, item.unit as SellingUnitCode)} × {formatMoney(item.unitPriceMinor)}
                    </span>
                    <span className="block font-mono text-xs text-ink-subtle">{item.sku}</span>
                  </span>
                  <span className="font-semibold tabular-nums">{formatMoney(item.lineTotalMinor)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-3 space-y-1.5 border-t border-line pt-3 text-sm">
              <div className="flex justify-between"><dt className="text-ink-muted">Subtotal</dt><dd className="tabular-nums">{formatMoney(order.subtotalMinor)}</dd></div>
              {order.discountMinor > 0 ? (
                <div className="flex justify-between"><dt className="text-ink-muted">Discount {order.couponCode ? `(${order.couponCode})` : ""}</dt><dd className="tabular-nums">−{formatMoney(order.discountMinor)}</dd></div>
              ) : null}
              <div className="flex justify-between"><dt className="text-ink-muted">Delivery</dt><dd className="tabular-nums">{formatMoney(order.deliveryFeeMinor)}</dd></div>
              <div className="flex justify-between text-base font-bold"><dt>Total</dt><dd className="tabular-nums">{formatMoney(order.totalMinor)}</dd></div>
            </dl>
          </Panel>

          <Panel title="Status history">
            <ol className="space-y-3 text-sm">
              {order.statusHistory.map((entry) => (
                <li key={entry.id} className="flex gap-3">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
                  <div>
                    <p className="font-medium">
                      {entry.fromStatus ? `${statusLabel(entry.fromStatus, order.fulfilmentMethod)} → ` : ""}
                      {statusLabel(entry.toStatus, order.fulfilmentMethod)}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {formatDateTime(entry.createdAt)} · {entry.actor?.name ?? "System"}
                      {entry.note ? `: ${entry.note}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Panel>

          <Panel title="Payments">
            {order.payments.length === 0 ? (
              <p className="text-sm text-ink-muted">No payment attempts recorded.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {order.payments.map((payment) => (
                  <li key={payment.id} className="py-2.5">
                    <div className="flex justify-between gap-3">
                      <span className="font-mono text-xs">{payment.reference}</span>
                      <span className="font-semibold">{payment.status}</span>
                    </div>
                    <p className="text-xs text-ink-muted">
                      {payment.provider} · {formatMoney(payment.amountMinor)} · {formatDateTime(payment.createdAt)}
                      {payment.channel ? ` · ${payment.channel}` : ""}
                      {payment.recordedBy ? ` · recorded by ${payment.recordedBy.name}` : ""}
                      {payment.gatewayResponse ? ` · ${payment.gatewayResponse}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-ink-subtle">Verified payment records cannot be edited. Refunds are issued from the payment provider&rsquo;s dashboard.</p>
          </Panel>
        </div>

        <div className="space-y-6">
          {canUpdate || canCancel ? (
            <Panel title="Update order">
              <OrderStatusControl orderId={order.id} options={next.map((s) => ({ value: s, label: statusLabel(s, order.fulfilmentMethod) }))} />
            </Panel>
          ) : null}
          {canRecordCash ? (
            <Panel title="Cash collection">
              <CashCollectionForm orderId={order.id} totalLabel={formatMoney(order.totalMinor)} totalDecimal={minorToDecimalString(order.totalMinor)} />
            </Panel>
          ) : null}
          <Panel title="Customer & delivery">
            <div className="space-y-1 text-sm text-ink-muted">
              <p className="font-semibold text-ink">
                <Link href={`/admin/customers/${encodeURIComponent(customerKey(order.phone))}`} className="hover:text-brand-700">{order.customerName}</Link>
              </p>
              <p>{order.phone}</p>
              {order.email ? <p>{order.email}</p> : null}
              <p className="pt-2 font-medium text-ink">{order.fulfilmentMethod === "PICKUP" ? "Pickup" : order.zoneName ? `Delivery to ${order.zoneName}` : "Delivery"}</p>
              {order.fulfilmentMethod === "DELIVERY" ? (
                <>
                  <p>{order.addressLine}</p>
                  {order.addressDetails ? <p>{order.addressDetails}</p> : null}
                  <p>{order.area}, {order.city}{order.region ? `, ${order.region}` : ""}</p>
                </>
              ) : null}
              {order.deliveryInstructions ? <p className="pt-2 italic">“{order.deliveryInstructions}”</p> : null}
            </div>
          </Panel>
          <Panel title="Internal notes">
            {canUpdate ? <OrderNoteForm orderId={order.id} /> : null}
            <ul className="mt-4 space-y-3 text-sm">
              {order.notes.map((note) => (
                <li key={note.id} className="rounded-md bg-soft p-3">
                  <p className="whitespace-pre-line">{note.body}</p>
                  <p className="mt-1 text-xs text-ink-subtle">{note.author?.name ?? "System"} · {formatDateTime(note.createdAt)}</p>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}
