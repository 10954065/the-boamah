import Link from "next/link";
import { AdminHeader, EmptyRow, TableWrap, td, th } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/feedback";
import { prisma } from "@/lib/db";
import { cn, formatDateTime } from "@/lib/utils";
import { requireStaffPage } from "@/server/session";

export const metadata = { title: "Notifications" };

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}

export default async function NotificationsPage() {
  await requireStaffPage("notifications:view", "/admin/notifications");
  const [items, failed] = await Promise.all([
    prisma.notification.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { order: { select: { id: true, reference: true } } } }),
    prisma.notification.count({ where: { status: "FAILED", createdAt: { gte: daysAgo(7) } } }),
  ]);
  return (
    <>
      <AdminHeader title="Notifications" description="Every email and SMS attempt with its real outcome. Skipped means the provider is not configured." />
      {failed > 0 ? (
        <Alert tone="danger" className="mb-4" title={`${failed} notification(s) failed in the last 7 days`}>
          Check the email/SMS provider credentials and the error messages below.
        </Alert>
      ) : null}
      <TableWrap>
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-line bg-soft/60">
            <tr>
              <th scope="col" className={th}>When</th>
              <th scope="col" className={th}>Type</th>
              <th scope="col" className={th}>To</th>
              <th scope="col" className={th}>Status</th>
              <th scope="col" className={th}>Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.length === 0 ? <EmptyRow colSpan={5}>No notifications yet.</EmptyRow> : null}
            {items.map((n) => (
              <tr key={n.id}>
                <td className={cn(td, "whitespace-nowrap text-ink-muted")}>{formatDateTime(n.createdAt)}</td>
                <td className={td}>
                  {n.channel} · {n.type.replace(/_/g, " ").toLowerCase()}
                  {n.order ? (
                    <Link href={`/admin/orders/${n.order.id}`} className="block font-mono text-xs text-brand-700 hover:underline">{n.order.reference}</Link>
                  ) : null}
                </td>
                <td className={td}>{n.recipient}</td>
                <td className={td}>
                  <Badge tone={n.status === "SENT" ? "success" : n.status === "FAILED" ? "danger" : "neutral"}>{n.status}</Badge>
                </td>
                <td className={cn(td, "max-w-xs text-xs text-ink-muted")}>{n.error ?? n.subject ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </>
  );
}
