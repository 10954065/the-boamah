import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/auth-forms";
import { Alert } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  const invalid = params.error === "INVALID_TOKEN" || !token;

  return (
    <>
      <h1 className="text-2xl font-extrabold">Choose a new password</h1>
      <div className="mt-6">
        {invalid ? (
          <Alert tone="danger" title="This reset link is invalid or has expired">
            Request a new one from the staff sign in page.
          </Alert>
        ) : (
          <ResetPasswordForm token={token} />
        )}
      </div>
    </>
  );
}
