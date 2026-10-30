import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { EditCreditCustomerForm, RecordCreditPaymentForm } from "@/components/admin/credit-managers";
import { AdminHeader, Panel, StatCard, TableWrap, td, th } from "@/components/admin/ui";
import { formatMoney, minorToDecimalString } from "@/lib/money";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { creditCustomerDetail } from "@/server/credit";
import { requireStaffPage } from "@/server/session";

export const metadata = { title: "Credit customer" };

export default async function CreditCustomerPage({ params }: PageProps<"/admin/credit/[id]">) {
  const { id } = await params;
  await requireStaffPage("credit:manage", `/admin/credit/${id}`);
  const customer = await creditCustomerDetail(id);
  if (!customer) notFound();
  const room = customer.limitMinor === null ? null : Math.max(customer.limitMinor - customer.owedMinor, 0);
  const statement = customer.statement.toReversed();

  return (
    <>
      <Link href="/admin/credit" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Credit customers
      </Link>
      <AdminHeader
        title={customer.name}
        description={`${customer.phone} · added ${formatDate(customer.createdAt)}${customer.addedByName ? ` by ${customer.addedByName}` : ""}${customer.isActive ? "" : " · credit stopped"}`}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Owes" value={formatMoney(customer.owedMinor)} tone={customer.owedMinor > 0 ? "warning" : "neutral"} />
        <StatCard label="Credit limit" value={customer.limitMinor === null ? "No limit" : formatMoney(customer.limitMinor)} />
        <StatCard label="Can still take" value={room === null ? "No limit" : formatMoney(room)} hint={customer.isActive ? undefined : "Credit is stopped"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <Panel title="Statement" description="Every sale on account, goods brought back, and payment, newest first." flush>
          <TableWrap>
            <table className="w-full min-w-[620px] text-sm">
              <thead className="border-b border-line bg-soft/60">
                <tr>
                  <th scope="col" className={th}>Date</th>
                  <th scope="col" className={th}>What</th>
                  <th scope="col" className={cn(th, "text-right")}>Amount</th>
                  <th scope="col" className={cn(th, "text-right")}>Owed after</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {statement.length === 0 ? (
                  <tr>
                    <td colSpan={4} className={cn(td, "text-center text-ink-muted")}>
                      Nothing on this account yet.
                    </td>
                  </tr>
                ) : null}
                {statement.map((entry) => (
                  <tr key={`${entry.kind}-${entry.id}`}>
                    <td className={cn(td, "whitespace-nowrap text-ink-muted")}>{formatDateTime(entry.at)}</td>
                    <td className={td}>
                      <p className="font-semibold">{entry.label}</p>
                      {entry.detail ? <p className="text-xs text-ink-muted">{entry.detail}</p> : null}
                    </td>
                    <td className={cn(td, "text-right font-semibold tabular-nums", entry.amountMinor > 0 ? "text-ink" : "text-success")}>
                      {entry.amountMinor > 0 ? "+" : "−"}
                      {formatMoney(Math.abs(entry.amountMinor))}
                    </td>
                    <td className={cn(td, "text-right tabular-nums")}>{formatMoney(entry.balanceAfterMinor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Panel>

        <div className="space-y-6">
          <Panel title="Record a payment" description="For money paid to the shop outside the till.">
            <RecordCreditPaymentForm customerId={customer.id} owedMinor={customer.owedMinor} />
          </Panel>
          <Panel title="Details and limit">
            <EditCreditCustomerForm
              id={customer.id}
              initial={{
                name: customer.name,
                phone: customer.phone,
                limit: customer.limitMinor === null ? "" : minorToDecimalString(customer.limitMinor),
                notes: customer.notes ?? "",
                isActive: customer.isActive,
              }}
            />
          </Panel>
        </div>
      </div>
    </>
  );
}
