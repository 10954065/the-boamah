import { StaffRoleForm } from "@/components/admin/store-managers";
import { AdminHeader, Panel, TableWrap, td, th } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/db";
import { PERMISSIONS, ROLE_LABELS, ROLE_PERMISSIONS, STAFF_ROLES } from "@/lib/permissions";
import { formatDate } from "@/lib/utils";
import { requireStaffPage } from "@/server/session";

export const metadata = { title: "Staff & roles" };

export default async function StaffPage() {
  await requireStaffPage("staff:manage", "/admin/staff");
  const staff = await prisma.user.findMany({
    where: { role: { not: "CUSTOMER" } },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: { id: true, name: true, email: true, role: true, status: true, createdAt: true },
  });
  return (
    <>
      <AdminHeader title="Staff & roles" description="Only a Super Admin can grant or remove roles. People must register an account before they can be given a role." />
      <Panel title="Assign a role" className="mb-6">
        <StaffRoleForm />
      </Panel>
      <TableWrap>
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-line bg-soft/60">
            <tr>
              <th scope="col" className={th}>Name</th>
              <th scope="col" className={th}>Role</th>
              <th scope="col" className={th}>Status</th>
              <th scope="col" className={th}>Since</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {staff.map((member) => (
              <tr key={member.id}>
                <td className={td}>
                  <p className="font-semibold">{member.name}</p>
                  <p className="text-xs text-ink-subtle">{member.email}</p>
                </td>
                <td className={td}><Badge tone="brand">{ROLE_LABELS[member.role]}</Badge></td>
                <td className={td}>{member.status === "ACTIVE" ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Suspended</Badge>}</td>
                <td className={td}>{formatDate(member.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <Panel title="What each role can do" className="mt-6">
        <div className="-m-5 overflow-x-auto">
          <table className="w-full min-w-[760px] text-xs">
            <thead className="border-b border-line">
              <tr>
                <th scope="col" className={th}>Permission</th>
                {STAFF_ROLES.map((role) => (
                  <th key={role} scope="col" className={th}>{ROLE_LABELS[role]}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {PERMISSIONS.map((permission) => (
                <tr key={permission}>
                  <td className="px-4 py-2 font-mono">{permission}</td>
                  {STAFF_ROLES.map((role) => (
                    <td key={role} className="px-4 py-2">
                      {ROLE_PERMISSIONS[role].includes(permission) ? <span aria-label="Allowed">✓</span> : <span className="text-ink-subtle" aria-label="Not allowed">✕</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
