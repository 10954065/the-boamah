import Link from "next/link";
import { notFound } from "next/navigation";
import { SuspendToggle } from "@/components/admin/order-controls";
import { AdminHeader, OrderStatusBadge, Panel, PaymentStatusBadge } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { hasPermission } from "@/lib/permissions";
import { formatDate, formatDateTime } from "@/lib/utils";
import { requireStaffPage } from "@/server/session";

export const metadata = { title: "Customer" };

export default async function AdminCustomerPage({ params }: PageProps<"/admin/customers/[id]">) {
  const { id } = await params;
  const viewer = await requireStaffPage("customers:view", `/admin/customers/${id}`);
  // Passwords live in the account table and are never selected here.
  const customer = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      status: true,
      createdAt: true,
      addresses: { orderBy: { isDefault: "desc" } },
      orders: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });
  if (!customer) notFound();
  const paidTotal = customer.orders.filter((o) => o.paymentStatus === "PAID").reduce((sum, o) => sum + o.totalMinor, 0);

  return (
    <>
      <Link href="/admin/customers" className="text-sm font-medium text-brand-700 hover:underline">← Customers</Link>
      <div className="mt-2">
        <AdminHeader
          title={customer.name}
          description={`Customer since ${formatDate(customer.createdAt)}`}
          actions={customer.status === "SUSPENDED" ? <Badge tone="danger">Suspended</Badge> : <Badge tone="success">Active</Badge>}
        />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_1.6fr]">
        <div className="space-y-6">
          <Panel title="Contact">
            <dl className="space-y-2 text-sm">
              <div><dt className="text-xs text-ink-subtle">Email</dt><dd>{customer.email}</dd></div>
              <div><dt className="text-xs text-ink-subtle">Phone</dt><dd>{customer.phone ?? "Not given"}</dd></div>
              <div><dt className="text-xs text-ink-subtle">Paid orders total</dt><dd className="font-semibold">{formatMoney(paidTotal)}</dd></div>
            </dl>
            {hasPermission(viewer.role, "customers:suspend") && customer.id !== viewer.id ? (
              <div className="mt-5 border-t border-line pt-4">
                <SuspendToggle userId={customer.id} suspended={customer.status === "SUSPENDED"} />
              </div>
            ) : null}
          </Panel>
          <Panel title="Saved addresses">
            {customer.addresses.length === 0 ? (
              <p className="text-sm text-ink-muted">No saved addresses.</p>
            ) : (
              <ul className="space-y-3 text-sm text-ink-muted">
                {customer.addresses.map((a) => (
                  <li key={a.id}>
                    <p className="font-medium text-ink">{a.label || a.recipientName}{a.isDefault ? " (default)" : ""}</p>
                    <p>{a.addressLine}, {a.area}, {a.city}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
        <Panel title={`Orders (${customer.orders.length})`}>
          {customer.orders.length === 0 ? (
            <p className="text-sm text-ink-muted">No orders yet.</p>
          ) : (
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
          )}
        </Panel>
      </div>
    </>
  );
}
