import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/auth-forms";
import { AuthHeading } from "@/components/auth/auth-shell";
import { Alert } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  const invalid = params.error === "INVALID_TOKEN" || !token;

  return (
    <>
      <AuthHeading title="Choose a new password">Pick something only you know. You will use it every time you sign in.</AuthHeading>
      {invalid ? (
        <Alert tone="danger" title="This reset link is invalid or has expired">
          Request a new one from the staff sign in page.
        </Alert>
      ) : (
        <ResetPasswordForm token={token} />
      )}
    </>
  );
}
