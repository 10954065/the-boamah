import Link from "next/link";
import { AddCreditCustomerDialog } from "@/components/admin/credit-managers";
import { AdminHeader, EmptyRow, FilterBar, StatCard, TableWrap, td, th } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/money";
import { cn, formatDate } from "@/lib/utils";
import { creditTotals, listCreditCustomers } from "@/server/credit";
import { requireStaffPage } from "@/server/session";

export const metadata = { title: "Credit customers" };

export default async function CreditCustomersPage({ searchParams }: PageProps<"/admin/credit">) {
  await requireStaffPage("credit:manage", "/admin/credit");
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 80) : "";
  const [customers, totals] = await Promise.all([listCreditCustomers(q), creditTotals()]);

  return (
    <>
      <AdminHeader
        title="Credit customers"
        description="People who buy at the till and pay later. Sales on account and payments at the till are recorded there; payments made to the shop another way are recorded here."
        actions={<AddCreditCustomerDialog />}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <StatCard label="Owed to the shop" value={formatMoney(totals.owedMinor)} tone={totals.owedMinor > 0 ? "warning" : "neutral"} />
        <StatCard label="Customers who owe" value={String(totals.customersOwing)} />
      </div>
      <FilterBar action="/admin/credit">
        <div className="min-w-56 flex-1">
          <label htmlFor="q" className="mb-1 block text-xs font-medium text-ink-muted">
            Name or phone
          </label>
          <Input id="q" name="q" defaultValue={q} />
        </div>
      </FilterBar>
      <TableWrap>
        <table className="w-full min-w-[680px] text-sm">
          <thead className="border-b border-line bg-soft/60">
            <tr>
              <th scope="col" className={th}>Customer</th>
              <th scope="col" className={th}>Phone</th>
              <th scope="col" className={cn(th, "text-right")}>Owes</th>
              <th scope="col" className={cn(th, "text-right")}>Limit</th>
              <th scope="col" className={th}>Last paid</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {customers.length === 0 ? <EmptyRow colSpan={5}>{q ? "Nobody matches that name or number." : "No credit customers yet. Add one here or at the till."}</EmptyRow> : null}
            {customers.map((customer) => (
              <tr key={customer.id} className="hover:bg-soft/40">
                <td className={td}>
                  <Link href={`/admin/credit/${customer.id}`} className="font-semibold text-ink hover:text-brand-700">
                    {customer.name}
                  </Link>
                  {customer.isActive ? null : (
                    <Badge tone="neutral" className="ml-2">
                      Credit stopped
                    </Badge>
                  )}
                </td>
                <td className={cn(td, "text-ink-muted")}>{customer.phone}</td>
                <td className={cn(td, "text-right font-semibold tabular-nums", customer.owedMinor > 0 ? "text-ink" : "text-ink-subtle")}>{formatMoney(customer.owedMinor)}</td>
                <td className={cn(td, "text-right tabular-nums text-ink-muted")}>{customer.limitMinor === null ? "No limit" : formatMoney(customer.limitMinor)}</td>
                <td className={cn(td, "text-ink-muted")}>{customer.lastPaidAt ? formatDate(customer.lastPaidAt) : "Not yet"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </>
  );
}
