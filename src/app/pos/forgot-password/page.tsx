import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth/auth-forms";
import { LogoMark } from "@/components/brand/logo";

export const metadata: Metadata = { title: "Reset your password" };

/** On the till's own address, because the shop's sign-in pages need the admin link. */
export default function PosForgotPasswordPage() {
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-lg border border-line bg-surface p-6 shadow-[var(--shadow-card)] sm:p-8">
        <div className="flex items-center gap-3">
          <LogoMark />
          <div>
            <p className="font-display text-lg font-extrabold leading-tight">The Boamah&apos;s till</p>
            <p className="text-sm text-ink-muted">Reset your password</p>
          </div>
        </div>
        <p className="mt-5 text-sm text-ink-muted">Enter your email and we&rsquo;ll send you a link to choose a new one.</p>
        <div className="mt-5">
          <ForgotPasswordForm />
        </div>
        <p className="mt-6 text-center text-sm">
          <Link href="/pos/login" className="font-semibold text-brand-700 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
