import Link from "next/link";
import { AdminHeader, EmptyRow, FilterBar, TableWrap, td, th } from "@/components/admin/ui";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { formatMoney } from "@/lib/money";
import { cn, formatDate } from "@/lib/utils";
import { listCustomers } from "@/server/customers";
import { requireStaffPage } from "@/server/session";

export const metadata = { title: "Customers" };
const PAGE_SIZE = 25;

export default async function AdminCustomersPage({ searchParams }: PageProps<"/admin/customers">) {
  await requireStaffPage("customers:view", "/admin/customers");
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 80) : "";
  const page = Math.max(1, Number.parseInt(typeof params.page === "string" ? params.page : "1", 10) || 1);
  const { rows, total } = await listCustomers(q, page, PAGE_SIZE);
  return (
    <>
      <AdminHeader title="Customers" description={`${total} customer${total === 1 ? "" : "s"}, from the details given at checkout. Orders with the same phone number count as one customer.`} />
      <FilterBar action="/admin/customers">
        <div className="min-w-56 flex-1">
          <label htmlFor="q" className="mb-1 block text-xs font-medium text-ink-muted">Name, email or phone</label>
          <Input id="q" name="q" defaultValue={q} />
        </div>
      </FilterBar>
      <TableWrap>
        <table className="w-full min-w-[680px] text-sm">
          <thead className="border-b border-line bg-soft/60">
            <tr>
              <th scope="col" className={th}>Customer</th>
              <th scope="col" className={th}>Phone</th>
              <th scope="col" className={th}>Orders</th>
              <th scope="col" className={th}>Paid</th>
              <th scope="col" className={th}>Last order</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.length === 0 ? <EmptyRow colSpan={5}>No customers found.</EmptyRow> : null}
            {rows.map((c) => (
              <tr key={c.key} className="hover:bg-soft/40">
                <td className={td}>
                  <Link href={`/admin/customers/${encodeURIComponent(c.key)}`} className="font-semibold text-ink hover:text-brand-700">{c.name}</Link>
                  {c.email ? <p className="text-xs text-ink-subtle">{c.email}</p> : null}
                </td>
                <td className={cn(td, "text-ink-muted")}>{c.key}</td>
                <td className={cn(td, "tabular-nums")}>{c.orders}</td>
                <td className={cn(td, "tabular-nums")}>{formatMoney(c.paidTotalMinor)}</td>
                <td className={cn(td, "text-ink-muted")}>{formatDate(c.lastOrderAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <Pagination className="mt-6" page={page} totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))} hrefFor={(n) => `/admin/customers?${new URLSearchParams({ ...(q ? { q } : {}), page: String(n) })}`} />
    </>
  );
}
