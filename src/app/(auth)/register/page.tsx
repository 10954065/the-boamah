import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/auth/auth-forms";
import { safeRedirectPath } from "@/lib/utils";
import { getCurrentUser } from "@/server/session";

export const metadata: Metadata = { title: "Create an account", robots: { index: false } };

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? safeRedirectPath(params.next, "/account") : undefined;
  if (await getCurrentUser()) redirect(next ?? "/account");

  return (
    <>
      <h1 className="text-2xl font-extrabold">Create your account</h1>
      <p className="mt-1 text-sm text-ink-muted">Faster checkout, saved addresses and order tracking.</p>
      <div className="mt-6">
        <RegisterForm next={next} />
      </div>
      <p className="mt-6 text-center text-sm text-ink-muted">
        Already have an account?{" "}
        <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="font-semibold text-brand-700 hover:underline">
          Sign in
        </Link>
      </p>
      <p className="mt-3 text-center text-xs text-ink-subtle">
        By creating an account you agree to our{" "}
        <Link href="/policies/terms" className="underline">
          terms
        </Link>{" "}
        and{" "}
        <Link href="/policies/privacy" className="underline">
          privacy policy
        </Link>
        .
      </p>
    </>
  );
}
