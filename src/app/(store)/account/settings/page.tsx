import type { Metadata } from "next";
import { PasswordForm } from "@/components/account/account-forms";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Password & security", robots: { index: false } };

export default async function AccountSettingsPage() {
  await requireUser("/account/settings");
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Password &amp; security</h1>
      <section className="rounded-lg border border-line bg-surface p-5 sm:p-6">
        <h2 className="mb-1 text-lg font-extrabold">Change password</h2>
        <p className="mb-5 text-sm text-ink-muted">Changing your password signs you out on your other devices.</p>
        <PasswordForm />
      </section>
    </div>
  );
}
