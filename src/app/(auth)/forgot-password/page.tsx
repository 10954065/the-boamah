import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth/auth-forms";
import { AuthHeading } from "@/components/auth/auth-shell";

export const metadata: Metadata = { title: "Reset your password", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <>
      <AuthHeading title="Forgot your password?">Enter your email and we&rsquo;ll send you a link to choose a new one.</AuthHeading>
      <ForgotPasswordForm />
      <p className="mt-8 text-center text-[14px] font-medium text-ink-muted">
        Remembered it?{" "}
        <Link href="/login" className="font-bold text-brand-700 hover:underline">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
