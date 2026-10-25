import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { AdminHeader, EmptyRow, FilterBar, TableWrap, td, th } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { prisma } from "@/lib/db";
import { cn, formatDate } from "@/lib/utils";
import { requireStaffPage } from "@/server/session";

export const metadata = { title: "Customers" };
const PAGE_SIZE = 25;

export default async function AdminCustomersPage({ searchParams }: PageProps<"/admin/customers">) {
  await requireStaffPage("customers:view", "/admin/customers");
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 80) : "";
  const page = Math.max(1, Number.parseInt(typeof params.page === "string" ? params.page : "1", 10) || 1);
  const where: Prisma.UserWhereInput = {
    role: "CUSTOMER",
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] } : {}),
  };
  const [customers, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { id: true, name: true, email: true, phone: true, status: true, createdAt: true, _count: { select: { orders: true } } },
    }),
    prisma.user.count({ where }),
  ]);
  return (
    <>
      <AdminHeader title="Customers" description={`${total} registered customer${total === 1 ? "" : "s"}. Guest orders are listed under Orders.`} />
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
              <th scope="col" className={th}>Joined</th>
              <th scope="col" className={th}>Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {customers.length === 0 ? <EmptyRow colSpan={5}>No customers found.</EmptyRow> : null}
            {customers.map((c) => (
              <tr key={c.id} className="hover:bg-soft/40">
                <td className={td}>
                  <Link href={`/admin/customers/${c.id}`} className="font-semibold text-ink hover:text-brand-700">{c.name}</Link>
                  <p className="text-xs text-ink-subtle">{c.email}</p>
                </td>
                <td className={cn(td, "text-ink-muted")}>{c.phone ?? "—"}</td>
                <td className={cn(td, "tabular-nums")}>{c._count.orders}</td>
                <td className={cn(td, "text-ink-muted")}>{formatDate(c.createdAt)}</td>
                <td className={td}>{c.status === "ACTIVE" ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Suspended</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <Pagination className="mt-6" page={page} totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))} hrefFor={(n) => `/admin/customers?${new URLSearchParams({ ...(q ? { q } : {}), page: String(n) })}`} />
    </>
  );
}
