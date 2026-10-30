import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/account/account-forms";
import { SignInForm } from "@/components/auth/auth-forms";
import { LogoMark } from "@/components/brand/logo";
import { Alert } from "@/components/ui/feedback";
import { hasPermission } from "@/lib/permissions";
import { getCurrentUser } from "@/server/session";

export const metadata: Metadata = { title: "Sign in" };

export default async function PosLoginPage() {
  const user = await getCurrentUser();
  if (user && hasPermission(user.role, "pos:sell")) redirect("/pos");

  return (
    <main id="main" className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-lg border border-line bg-surface p-6 shadow-[var(--shadow-card)] sm:p-8">
        <div className="flex items-center gap-3">
          <LogoMark />
          <div>
            <p className="font-display text-lg font-extrabold leading-tight">The Boamah&apos;s till</p>
            <p className="text-sm text-ink-muted">For shop staff</p>
          </div>
        </div>
        {user ? (
          <div className="mt-6 space-y-4">
            <Alert tone="warning">
              {user.email} cannot use the till. Ask the Super Admin to give this account the Cashier role, or sign in with another account.
            </Alert>
            <SignOutButton className="w-full" />
          </div>
        ) : (
          <div className="mt-6">
            <SignInForm next="/pos" />
          </div>
        )}
      </div>
    </main>
  );
}
