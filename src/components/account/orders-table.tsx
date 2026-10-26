import Link from "next/link";
import { Package } from "lucide-react";
import type { Order } from "@/generated/prisma/client";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { paymentTone } from "@/components/store/order-detail";
import { formatMoney } from "@/lib/money";
import { paymentStatusLabel, statusLabel } from "@/lib/order-status";
import { formatDate } from "@/lib/utils";
import { BuyAgainButton } from "./buy-again-button";

export function OrdersTable({ orders }: { orders: Order[] }) {
  if (orders.length === 0) {
    return (
      <div className="rounded-lg border border-line bg-surface">
        <EmptyState
          icon={<Package />}
          title="No orders yet"
          description="When you place an order it will appear here so you can follow its progress."
          action={
            <Link href="/shop" className={buttonVariants()}>
              Start shopping
            </Link>
          }
        />
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="border-b border-line bg-soft/60 text-xs uppercase tracking-wider text-ink-subtle">
          <tr>
            <th scope="col" className="px-4 py-3 font-semibold">Order</th>
            <th scope="col" className="px-4 py-3 font-semibold">Date</th>
            <th scope="col" className="px-4 py-3 font-semibold">Status</th>
            <th scope="col" className="px-4 py-3 font-semibold">Payment</th>
            <th scope="col" className="px-4 py-3 text-right font-semibold">Total</th>
            <th scope="col" className="px-4 py-3 font-semibold"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {orders.map((order) => (
            <tr key={order.id} className="hover:bg-soft/40">
              <td className="px-4 py-3">
                <Link href={`/account/orders/${order.reference}`} className="font-mono font-semibold text-brand-700 hover:underline">
                  {order.reference}
                </Link>
              </td>
              <td className="px-4 py-3 text-ink-muted">{formatDate(order.createdAt)}</td>
              <td className="px-4 py-3">
                <Badge tone={order.status === "CANCELLED" ? "danger" : order.status === "DELIVERED" ? "success" : "info"}>
                  {statusLabel(order.status, order.fulfilmentMethod)}
                </Badge>
              </td>
              <td className="px-4 py-3">
                <Badge tone={paymentTone(order.paymentStatus)}>{paymentStatusLabel(order.paymentStatus, order.paymentMethod)}</Badge>
              </td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatMoney(order.totalMinor)}</td>
              <td className="px-4 py-3 text-right">
                <BuyAgainButton reference={order.reference} size="sm" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
