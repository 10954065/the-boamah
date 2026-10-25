import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { AdminHeader, EmptyRow, FilterBar, OrderStatusBadge, PaymentStatusBadge, TableWrap, td, th } from "@/components/admin/ui";
import { Input, Select } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { ORDER_STATUSES, statusLabel } from "@/lib/order-status";
import { cn, formatDateTime } from "@/lib/utils";
import { requireStaffPage } from "@/server/session";

export const metadata = { title: "Orders" };
const PAGE_SIZE = 25;
const PAYMENT_STATUSES = ["PENDING", "PAID", "FAILED", "UNPAID"] as const;

export default async function AdminOrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  await requireStaffPage("orders:view", "/admin/orders");
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 80) : "";
  const status = ORDER_STATUSES.find((s) => s === params.status);
  const payment = PAYMENT_STATUSES.find((s) => s === params.payment);
  const method = params.method === "PAYSTACK" || params.method === "CASH_ON_DELIVERY" ? params.method : undefined;
  const page = Math.max(1, Number.parseInt(typeof params.page === "string" ? params.page : "1", 10) || 1);

  const where: Prisma.OrderWhereInput = {
    ...(q
      ? {
          OR: [
            { reference: { contains: q, mode: "insensitive" } },
            { customerName: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { phone: { contains: q.replace(/\s/g, "") } },
          ],
        }
      : {}),
    ...(status ? { status } : {}),
    ...(payment ? { paymentStatus: payment } : {}),
    ...(method ? { paymentMethod: method } : {}),
  };
  const [orders, total] = await Promise.all([
    prisma.order.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.order.count({ where }),
  ]);
  const query = Object.fromEntries(Object.entries({ q, status, payment, method }).filter(([, v]) => v)) as Record<string, string>;

  return (
    <>
      <AdminHeader title="Orders" description={`${total} order${total === 1 ? "" : "s"} match`} />
      <FilterBar action="/admin/orders">
        <div className="min-w-56 flex-1">
          <label htmlFor="q" className="mb-1 block text-xs font-medium text-ink-muted">Reference, name, email or phone</label>
          <Input id="q" name="q" defaultValue={q} />
        </div>
        <div>
          <label htmlFor="status" className="mb-1 block text-xs font-medium text-ink-muted">Status</label>
          <Select id="status" name="status" defaultValue={status ?? ""}>
            <option value="">All</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>{statusLabel(s)}</option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="payment" className="mb-1 block text-xs font-medium text-ink-muted">Payment</label>
          <Select id="payment" name="payment" defaultValue={payment ?? ""}>
            <option value="">All</option>
            <option value="PAID">Paid</option>
            <option value="PENDING">Awaiting online payment</option>
            <option value="UNPAID">Unpaid (cash on delivery)</option>
            <option value="FAILED">Failed</option>
          </Select>
        </div>
        <div>
          <label htmlFor="method" className="mb-1 block text-xs font-medium text-ink-muted">Method</label>
          <Select id="method" name="method" defaultValue={method ?? ""}>
            <option value="">All</option>
            <option value="PAYSTACK">Online (Paystack)</option>
            <option value="CASH_ON_DELIVERY">Cash on delivery</option>
          </Select>
        </div>
      </FilterBar>
      <TableWrap>
        <table className="w-full min-w-[880px] text-sm">
          <thead className="border-b border-line bg-soft/60">
            <tr>
              <th scope="col" className={th}>Order</th>
              <th scope="col" className={th}>Customer</th>
              <th scope="col" className={th}>Placed</th>
              <th scope="col" className={th}>Status</th>
              <th scope="col" className={th}>Payment</th>
              <th scope="col" className={cn(th, "text-right")}>Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {orders.length === 0 ? <EmptyRow colSpan={6}>No orders match these filters.</EmptyRow> : null}
            {orders.map((order) => (
              <tr key={order.id} className="hover:bg-soft/40">
                <td className={td}>
                  <Link href={`/admin/orders/${order.id}`} className="font-mono text-[13px] font-semibold text-brand-700 hover:underline">
                    {order.reference}
                  </Link>
                  <p className="text-xs text-ink-subtle">{order.fulfilmentMethod === "PICKUP" ? "Pickup" : order.zoneName ?? "Delivery"}</p>
                </td>
                <td className={td}>
                  <p>{order.customerName}</p>
                  <p className="text-xs text-ink-subtle">{order.phone}</p>
                </td>
                <td className={cn(td, "whitespace-nowrap text-ink-muted")}>{formatDateTime(order.createdAt)}</td>
                <td className={td}>
                  <OrderStatusBadge status={order.status} method={order.fulfilmentMethod} />
                </td>
                <td className={td}>
                  <PaymentStatusBadge status={order.paymentStatus} method={order.paymentMethod} />
                  <p className="mt-0.5 text-xs text-ink-subtle">{order.paymentMethod === "PAYSTACK" ? "Online" : "Cash"}</p>
                </td>
                <td className={cn(td, "text-right font-semibold tabular-nums")}>{formatMoney(order.totalMinor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <Pagination className="mt-6" page={page} totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))} hrefFor={(n) => `/admin/orders?${new URLSearchParams({ ...query, page: String(n) })}`} />
    </>
  );
}
