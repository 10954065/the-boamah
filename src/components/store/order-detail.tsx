import Image from "next/image";
import { Check, Circle, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/feedback";
import { formatMoney } from "@/lib/money";
import { paymentStatusLabel, statusLabel, timelineSteps, type OrderStatusCode } from "@/lib/order-status";
import { formatQuantity, type SellingUnitCode } from "@/lib/quantity";
import { cn, formatDateTime } from "@/lib/utils";
import type { CustomerOrder } from "@/server/orders/access";
import { RetryPaymentButton } from "./retry-payment-button";

export function paymentTone(status: CustomerOrder["paymentStatus"]): "success" | "warning" | "danger" | "neutral" {
  if (status === "PAID") return "success";
  if (status === "FAILED") return "danger";
  if (status === "PENDING") return "warning";
  return "neutral";
}

function Timeline({ order }: { order: CustomerOrder }) {
  if (order.status === "CANCELLED") {
    return (
      <div className="flex items-center gap-3 rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">
        <X className="h-5 w-5" aria-hidden="true" />
        <div>
          <p className="font-semibold">Order cancelled</p>
          {order.cancelReason ? <p className="text-ink-muted">{order.cancelReason}</p> : null}
        </div>
      </div>
    );
  }
  const steps = timelineSteps(order.fulfilmentMethod);
  const reachedAt = new Map<OrderStatusCode, Date>();
  for (const entry of order.statusHistory) reachedAt.set(entry.toStatus, entry.createdAt);
  const currentIndex = steps.indexOf(order.status);

  return (
    <ol className="grid gap-0 sm:grid-cols-[repeat(auto-fit,minmax(0,1fr))]">
      {order.status === "PENDING_PAYMENT" ? (
        <li className="mb-3 sm:col-span-full">
          <Alert tone="warning" title="Awaiting payment">
            Your order will be confirmed as soon as your payment is verified.
          </Alert>
        </li>
      ) : null}
      {steps.map((step, index) => {
        const done = currentIndex >= index;
        const current = currentIndex === index;
        const at = reachedAt.get(step);
        return (
          <li key={step} className="relative flex gap-3 pb-5 sm:flex-col sm:items-center sm:pb-0 sm:text-center">
            {index < steps.length - 1 ? (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute left-[13px] top-7 h-[calc(100%-1.75rem)] w-0.5 sm:left-1/2 sm:top-[13px] sm:h-0.5 sm:w-full",
                  currentIndex > index ? "bg-brand-500" : "bg-line",
                )}
              />
            ) : null}
            <span
              className={cn(
                "relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2",
                done ? "border-brand-600 bg-brand-600 text-white" : "border-line-strong bg-surface text-ink-subtle",
              )}
            >
              {done ? <Check className="h-4 w-4" aria-hidden="true" /> : <Circle className="h-2 w-2 fill-current" aria-hidden="true" />}
            </span>
            <span className="sm:mt-2">
              <span className={cn("block text-sm font-semibold", current ? "text-brand-800" : done ? "text-ink" : "text-ink-subtle")}>
                {statusLabel(step, order.fulfilmentMethod)}
                <span className="sr-only">{done ? " — completed" : " — pending"}</span>
              </span>
              {at ? <span className="block text-xs text-ink-muted">{formatDateTime(at)}</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function OrderDetail({
  order,
  placed,
  paymentNotice,
  guestToken,
  confirmationEmailed = false,
}: {
  order: CustomerOrder;
  placed?: boolean;
  paymentNotice?: string;
  guestToken?: string;
  /** True only when a confirmation email was actually delivered to the provider. */
  confirmationEmailed?: boolean;
}) {
  const canPay = order.status === "PENDING_PAYMENT" && order.paymentStatus !== "PAID" && (!order.paymentDueAt || order.paymentDueAt > new Date());

  return (
    <div className="space-y-6">
      {placed && order.status !== "PENDING_PAYMENT" ? (
        <Alert tone="success" title="Thank you — your order has been received">
          {confirmationEmailed && order.email ? `A confirmation has been sent to ${order.email}. ` : ""}Your order reference is <strong>{order.reference}</strong>.
        </Alert>
      ) : null}
      {paymentNotice === "failed" ? (
        <Alert tone="danger" title="Your payment was not completed">
          You have not been charged for this attempt. You can try again below.
        </Alert>
      ) : null}
      {paymentNotice === "error" ? (
        <Alert tone="warning" title="We couldn't start the payment">
          Your order has been saved. Please try paying again below.
        </Alert>
      ) : null}

      {canPay ? (
        <div className="flex flex-col gap-3 rounded-lg border border-gold-300 bg-gold-50 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-ink">Complete your payment of {formatMoney(order.totalMinor)}</p>
            {order.paymentDueAt ? (
              <p className="text-sm text-ink-muted">Unpaid orders are released after {formatDateTime(order.paymentDueAt)}.</p>
            ) : null}
          </div>
          <RetryPaymentButton reference={order.reference} token={guestToken} />
        </div>
      ) : null}

      <section aria-labelledby="progress-title" className="rounded-lg border border-line bg-surface p-5 sm:p-6">
        <h2 id="progress-title" className="mb-5 text-lg font-extrabold">
          Order progress
        </h2>
        <Timeline order={order} />
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <section aria-labelledby="items-title" className="rounded-lg border border-line bg-surface p-5 sm:p-6">
          <h2 id="items-title" className="text-lg font-extrabold">
            Items
          </h2>
          <ul className="mt-4 divide-y divide-line">
            {order.items.map((item) => (
              <li key={item.id} className="flex gap-3 py-3">
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-soft">
                  {item.imageUrl ? <Image src={item.imageUrl} alt="" fill sizes="56px" className="object-cover" /> : null}
                </div>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium text-ink">{item.productName}</p>
                  <p className="text-ink-muted">
                    {item.variantName} · {formatQuantity(item.quantityMilli, item.unit as SellingUnitCode)} × {formatMoney(item.unitPriceMinor)}
                  </p>
                </div>
                <p className="text-sm font-semibold tabular-nums">{formatMoney(item.lineTotalMinor)}</p>
              </li>
            ))}
          </ul>
          <dl className="mt-2 space-y-2 border-t border-line pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-muted">Subtotal</dt>
              <dd className="tabular-nums">{formatMoney(order.subtotalMinor)}</dd>
            </div>
            {order.discountMinor > 0 ? (
              <div className="flex justify-between text-success">
                <dt>Discount{order.couponCode ? ` (${order.couponCode})` : ""}</dt>
                <dd className="tabular-nums">−{formatMoney(order.discountMinor)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between">
              <dt className="text-ink-muted">{order.fulfilmentMethod === "PICKUP" ? "Pickup" : "Delivery"}</dt>
              <dd className="tabular-nums">{order.deliveryFeeMinor > 0 ? formatMoney(order.deliveryFeeMinor) : "Free"}</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-2 text-base font-bold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatMoney(order.totalMinor)}</dd>
            </div>
          </dl>
        </section>

        <aside className="space-y-4">
          <section className="rounded-lg border border-line bg-surface p-5 text-sm">
            <h2 className="font-bold text-ink">Payment</h2>
            <p className="mt-2 flex items-center gap-2">
              <Badge tone={paymentTone(order.paymentStatus)}>{paymentStatusLabel(order.paymentStatus, order.paymentMethod)}</Badge>
              <span className="text-ink-muted">{order.paymentMethod === "PAYSTACK" ? "Online (Paystack)" : order.fulfilmentMethod === "PICKUP" ? "Pay on collection" : "Cash on delivery"}</span>
            </p>
          </section>
          <section className="rounded-lg border border-line bg-surface p-5 text-sm">
            <h2 className="font-bold text-ink">{order.fulfilmentMethod === "PICKUP" ? "Pickup" : "Delivery address"}</h2>
            <div className="mt-2 space-y-0.5 text-ink-muted">
              <p className="font-medium text-ink">{order.customerName}</p>
              <p>{order.phone}</p>
              {order.fulfilmentMethod === "DELIVERY" ? (
                <>
                  <p>{order.addressLine}</p>
                  {order.addressDetails ? <p>{order.addressDetails}</p> : null}
                  <p>
                    {order.area}, {order.city}
                  </p>
                  {order.zoneName ? <p>Zone: {order.zoneName}</p> : null}
                </>
              ) : (
                <p>Collect from our store.</p>
              )}
              {order.deliveryInstructions ? <p className="pt-2 italic">“{order.deliveryInstructions}”</p> : null}
            </div>
          </section>
          <p className="text-xs text-ink-subtle">Placed {formatDateTime(order.createdAt)}</p>
        </aside>
      </div>
    </div>
  );
}
