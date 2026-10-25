import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Reset your password", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-2xl font-extrabold">Forgot your password?</h1>
      <p className="mt-1 text-sm text-ink-muted">Enter your email and we&rsquo;ll send you a link to choose a new one.</p>
      <div className="mt-6">
        <ForgotPasswordForm />
      </div>
      <p className="mt-6 text-center text-sm text-ink-muted">
        Remembered it?{" "}
        <Link href="/login" className="font-semibold text-brand-700 hover:underline">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
