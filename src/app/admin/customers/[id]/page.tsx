import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminHeader, OrderStatusBadge, Panel, PaymentStatusBadge } from "@/components/admin/ui";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/utils";
import { customerByKey } from "@/server/customers";
import { requireStaffPage } from "@/server/session";

export const metadata = { title: "Customer" };

/** One customer, identified by the phone number used at checkout. */
export default async function AdminCustomerPage({ params }: PageProps<"/admin/customers/[id]">) {
  const { id } = await params;
  await requireStaffPage("customers:view", `/admin/customers/${id}`);
  const customer = await customerByKey(id);
  if (!customer) notFound();

  return (
    <>
      <Link href="/admin/customers" className="text-sm font-medium text-brand-700 hover:underline">← Customers</Link>
      <div className="mt-2">
        <AdminHeader title={customer.name} description={`First ordered ${formatDate(customer.firstOrderAt)}`} />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_1.6fr]">
        <Panel title="Contact">
          <dl className="space-y-2 text-sm">
            <div><dt className="text-xs text-ink-subtle">Phone</dt><dd>{customer.phone}</dd></div>
            <div><dt className="text-xs text-ink-subtle">Email</dt><dd>{customer.email ?? "Not given"}</dd></div>
            <div><dt className="text-xs text-ink-subtle">Paid orders total</dt><dd className="font-semibold">{formatMoney(customer.paidTotalMinor)}</dd></div>
            {customer.lastAddress ? (
              <div>
                <dt className="text-xs text-ink-subtle">Last delivery address</dt>
                <dd>{customer.lastAddress.addressLine}, {customer.lastAddress.area}, {customer.lastAddress.city}</dd>
              </div>
            ) : null}
          </dl>
        </Panel>
        <Panel title={`Orders (${customer.orderCount})`}>
          <ul className="divide-y divide-line text-sm">
            {customer.orders.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div>
                  <Link href={`/admin/orders/${o.id}`} className="font-mono text-[13px] font-semibold text-brand-700 hover:underline">{o.reference}</Link>
                  <p className="text-xs text-ink-subtle">{formatDateTime(o.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <OrderStatusBadge status={o.status} method={o.fulfilmentMethod} />
                  <PaymentStatusBadge status={o.paymentStatus} method={o.paymentMethod} />
                  <span className="w-24 text-right font-semibold tabular-nums">{formatMoney(o.totalMinor)}</span>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}
