import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/account/account-forms";
import { SignInForm } from "@/components/auth/auth-forms";
import { AuthHeading, AuthShell } from "@/components/auth/auth-shell";
import { Alert } from "@/components/ui/feedback";
import { hasPermission } from "@/lib/permissions";
import { getCurrentUser } from "@/server/session";

export const metadata: Metadata = { title: "Sign in" };

export default async function PosLoginPage() {
  const user = await getCurrentUser();
  if (user && hasPermission(user.role, "pos:sell")) redirect("/pos");

  return (
    <AuthShell place="till">
      {user ? (
        <>
          <AuthHeading title="This account cannot use the till" />
          <div className="space-y-4">
            <Alert tone="warning">
              {user.email} cannot use the till. Ask the Super Admin to give this account the Cashier role, or sign in with another account.
            </Alert>
            <SignOutButton className="w-full" />
          </div>
        </>
      ) : (
        <>
          <AuthHeading title="Sign in to the till">Use your email and password to open your shift.</AuthHeading>
          <SignInForm next="/pos" forgotHref="/pos/forgot-password" />
        </>
      )}
    </AuthShell>
  );
}
