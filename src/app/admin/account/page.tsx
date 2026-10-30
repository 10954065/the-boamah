import { PasswordForm, ProfileForm } from "@/components/account/account-forms";
import { AdminHeader, Panel } from "@/components/admin/ui";
import { requireStaffPage } from "@/server/session";

export const metadata = { title: "My account" };

export default async function MyAccountPage() {
  const user = await requireStaffPage("dashboard:view", "/admin/account");
  return (
    <>
      <AdminHeader title="My account" description="Your name prints on till receipts and refund slips." />
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Your details">
          <ProfileForm name={user.name} phone={user.phone} email={user.email} />
        </Panel>
        <Panel title="Change password">
          <PasswordForm />
        </Panel>
      </div>
    </>
  );
}
