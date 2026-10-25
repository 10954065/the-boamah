import type { Metadata } from "next";
import Link from "next/link";
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
            <Link href="/forgot-password" className="font-semibold underline">
              Request a new reset link
            </Link>
          </Alert>
        ) : (
          <ResetPasswordForm token={token} />
        )}
      </div>
    </>
  );
}
