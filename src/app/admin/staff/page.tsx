import { Check, ChevronDown, Minus } from "lucide-react";
import { PrivateLinks, StaffCardActions, StaffRoleForm } from "@/components/admin/staff-manager";
import { AddStaffDialog, SignInPlaceTags } from "@/components/admin/staff-onboarding";
import { AdminHeader, Initials, Panel, th } from "@/components/admin/ui";
import { Alert } from "@/components/ui/feedback";
import { prisma } from "@/lib/db";
import { ROLE_LABELS, ROLE_PERMISSIONS, type Permission } from "@/lib/permissions";
import { ROLE_CHOICES, ROLE_DESCRIPTIONS, type StaffRole } from "@/lib/staff-onboarding";
import { cn, formatDate } from "@/lib/utils";
import { requireStaffPage } from "@/server/session";
import { signInLinks, staffLinks } from "@/server/staff";

export const metadata = { title: "Staff & roles" };

const PERMISSION_LABELS: Record<Permission, string> = {
  "dashboard:view": "See the dashboard",
  "catalog:view": "See products and categories",
  "catalog:edit": "Add and change products and prices",
  "inventory:adjust": "Change stock counts",
  "orders:view": "See website orders",
  "orders:update": "Move orders along",
  "orders:cancel": "Cancel orders",
  "payments:record": "Record cash collected",
  "customers:view": "See customers",
  "promotions:manage": "Coupons and banners",
  "reviews:manage": "Approve reviews",
  "delivery:manage": "Delivery zones and fees",
  "settings:manage": "Shop settings",
  "staff:manage": "Add staff and change roles",
  "notifications:view": "See sent emails and texts",
  "audit:view": "See the audit log",
  "pos:sell": "Sell on the shop till",
  "pos:manage": "Till sales, shifts and refunds",
  "credit:manage": "Credit customers and their payments",
};

export default async function StaffPage() {
  const viewer = await requireStaffPage("staff:manage", "/admin/staff");
  const links = staffLinks();
  const loginLinks = signInLinks();
  const staff = await prisma.user.findMany({
    where: { role: { not: "CUSTOMER" } },
    orderBy: [{ status: "asc" }, { role: "asc" }, { name: "asc" }],
    select: { id: true, name: true, email: true, phone: true, role: true, status: true, createdAt: true },
  });
  const suspended = staff.filter((member) => member.status !== "ACTIVE").length;

  return (
    <>
      <AdminHeader
        title="Staff & roles"
        description="Give each person their own login and only the access their job needs. Only a Super Admin can do this."
        actions={<AddStaffDialog links={loginLinks} />}
      />

      <Panel
        title="Your team"
        description={`${staff.length} ${staff.length === 1 ? "person" : "people"}${suspended ? `, ${suspended} suspended` : ""}`}
        className="mb-6"
      >
        <ul aria-label="Staff" className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {staff.map((member) => {
            const role = member.role as StaffRole;
            const isYou = member.id === viewer.id;
            const isSuspended = member.status !== "ACTIVE";
            return (
              <li
                key={member.id}
                className={cn(
                  "flex flex-col rounded-xl border p-5",
                  isSuspended ? "border-danger/30 bg-danger-soft/30" : "border-line bg-surface",
                )}
              >
                <div className="flex items-start gap-4">
                  <Initials name={member.name} className={cn("h-11 w-11 text-[15px]", isSuspended && "opacity-60")} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-ink">
                      <span className="truncate">{member.name}</span>
                      {isYou ? <span className="text-[12.5px] font-normal text-ink-subtle">(you)</span> : null}
                    </p>
                    <p className="truncate text-[13px] text-ink-muted">{member.email}</p>
                    {member.phone ? <p className="text-[13px] text-ink-muted">{member.phone}</p> : null}
                  </div>
                  {isSuspended ? <span className="shrink-0 rounded-full bg-danger-soft px-2.5 py-0.5 text-[11px] font-semibold text-danger">Suspended</span> : null}
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-semibold text-ink">{ROLE_LABELS[role]}</span>
                  <SignInPlaceTags role={role} />
                  <span className="ml-auto text-[12px] text-ink-subtle">Since {formatDate(member.createdAt)}</span>
                </div>
                <div className="mt-4 border-t border-line pt-4">
                  {isYou ? (
                    <p className="text-[13px] text-ink-muted">Change your own details and password under My account.</p>
                  ) : (
                    <StaffCardActions userId={member.id} name={member.name} email={member.email} role={role} suspended={isSuspended} links={loginLinks} />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Private links" description="The only way into the admin and the till">
          {links ? <PrivateLinks {...links} /> : <Alert tone="warning">Set STAFF_GATE_KEY on the server to get the private links.</Alert>}
        </Panel>

        <Panel title="What each role is for">
          <ul className="-my-1 divide-y divide-line">
            {ROLE_CHOICES.map((role) => (
              <li key={role} className="py-2.5">
                <p className="flex flex-wrap items-center gap-2 text-[14px] font-semibold">
                  {ROLE_LABELS[role]} <SignInPlaceTags role={role} />
                </p>
                <p className="text-[13px] text-ink-muted">{ROLE_DESCRIPTIONS[role]}</p>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <details className="group mt-6 rounded-xl border border-line bg-surface">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3.5 font-display text-[15px] font-bold [&::-webkit-details-marker]:hidden">
          Exactly what each role can do
          <ChevronDown className="h-5 w-5 text-ink-muted transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full min-w-[760px] text-[13px]">
            <thead className="bg-soft/60">
              <tr>
                <th scope="col" className={cn(th, "px-5")}>Can</th>
                {ROLE_CHOICES.map((role) => (
                  <th key={role} scope="col" className={cn(th, "px-3 text-center")}>{ROLE_LABELS[role]}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(Object.keys(PERMISSION_LABELS) as Permission[]).map((permission) => (
                <tr key={permission}>
                  <th scope="row" className="px-5 py-2.5 text-left font-medium">{PERMISSION_LABELS[permission]}</th>
                  {ROLE_CHOICES.map((role) => (
                    <td key={role} className="px-3 py-2.5 text-center">
                      {ROLE_PERMISSIONS[role].includes(permission) ? (
                        <Check className="mx-auto h-4 w-4 text-success" strokeWidth={3} aria-label="Yes" />
                      ) : (
                        <Minus className="mx-auto h-4 w-4 text-line-strong" aria-label="No" />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <details className="group mt-4 rounded-xl border border-line bg-surface">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3.5 font-display text-[15px] font-bold [&::-webkit-details-marker]:hidden">
          Give an old shop account a staff role
          <ChevronDown className="h-5 w-5 text-ink-muted transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="border-t border-line p-5">
          <p className="mb-4 text-[13px] text-ink-muted">
            Only for an email that had a shopping account before the shop went guest only. Then reset its password from its card above.
          </p>
          <StaffRoleForm />
        </div>
      </details>
    </>
  );
}
