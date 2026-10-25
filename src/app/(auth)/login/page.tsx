import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/auth/auth-forms";
import { Alert } from "@/components/ui/feedback";
import { safeRedirectPath } from "@/lib/utils";
import { getCurrentUser } from "@/server/session";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? safeRedirectPath(params.next, "/account") : undefined;
  const user = await getCurrentUser();
  if (user) redirect(next ?? (user.isStaff ? "/admin" : "/account"));

  return (
    <>
      <h1 className="text-2xl font-extrabold">Welcome back</h1>
      <p className="mt-1 text-sm text-ink-muted">Sign in to track orders, save addresses and keep your wishlist.</p>
      {params.reset === "1" ? (
        <Alert tone="success" className="mt-5">
          Your password has been updated. Please sign in with your new password.
        </Alert>
      ) : null}
      <div className="mt-6">
        <SignInForm next={next} />
      </div>
      <p className="mt-6 text-center text-sm text-ink-muted">
        New here?{" "}
        <Link href={next ? `/register?next=${encodeURIComponent(next)}` : "/register"} className="font-semibold text-brand-700 hover:underline">
          Create an account
        </Link>
      </p>
    </>
  );
}
