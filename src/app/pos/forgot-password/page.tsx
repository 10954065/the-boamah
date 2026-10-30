import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth/auth-forms";
import { AuthHeading, AuthShell } from "@/components/auth/auth-shell";

export const metadata: Metadata = { title: "Reset your password" };

/** On the till's own address, because the shop's sign-in pages need the admin link. */
export default function PosForgotPasswordPage() {
  return (
    <AuthShell place="till">
      <AuthHeading title="Forgot your password?">Enter your email and we&rsquo;ll send you a link to choose a new one.</AuthHeading>
      <ForgotPasswordForm />
      <p className="mt-8 text-center text-[14px] font-medium text-ink-muted">
        Remembered it?{" "}
        <Link href="/pos/login" className="font-bold text-brand-700 hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
