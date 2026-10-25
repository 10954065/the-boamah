import { AdminHeader, EmptyRow, TableWrap, td, th } from "@/components/admin/ui";
import { Pagination } from "@/components/ui/pagination";
import { prisma } from "@/lib/db";
import { cn, formatDateTime } from "@/lib/utils";
import { requireStaffPage } from "@/server/session";

export const metadata = { title: "Audit log" };
const PAGE_SIZE = 50;

export default async function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  await requireStaffPage("audit:view", "/admin/audit");
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(typeof params.page === "string" ? params.page : "1", 10) || 1);
  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { actor: { select: { name: true, email: true } } } }),
    prisma.auditLog.count(),
  ]);
  return (
    <>
      <AdminHeader title="Audit log" description="Sensitive administrative actions, newest first. Entries cannot be edited." />
      <TableWrap>
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-line bg-soft/60">
            <tr>
              <th scope="col" className={th}>When</th>
              <th scope="col" className={th}>Who</th>
              <th scope="col" className={th}>Action</th>
              <th scope="col" className={th}>Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {entries.length === 0 ? <EmptyRow colSpan={4}>No actions recorded yet.</EmptyRow> : null}
            {entries.map((e) => (
              <tr key={e.id}>
                <td className={cn(td, "whitespace-nowrap text-ink-muted")}>{formatDateTime(e.createdAt)}</td>
                <td className={td}>{e.actor ? e.actor.name : "System / CLI"}</td>
                <td className={td}>
                  <span className="font-mono text-xs">{e.action}</span>
                  <span className="block text-xs text-ink-subtle">{e.entityType}{e.entityId ? ` · ${e.entityId}` : ""}</span>
                </td>
                <td className={cn(td, "max-w-md break-words font-mono text-[11px] text-ink-muted")}>{e.details ? JSON.stringify(e.details) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <Pagination className="mt-6" page={page} totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))} hrefFor={(n) => `/admin/audit?page=${n}`} />
    </>
  );
}
