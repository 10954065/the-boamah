import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/auth/auth-forms";
import { AuthHeading } from "@/components/auth/auth-shell";
import { safeRedirectPath } from "@/lib/utils";
import { getCurrentUser } from "@/server/session";

export const metadata: Metadata = { title: "Staff sign in", robots: { index: false } };

/** Staff only: hidden behind the private admin link (src/proxy.ts). Shoppers check out as guests. */
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? safeRedirectPath(params.next, "/admin") : undefined;
  const user = await getCurrentUser();
  if (user) redirect(next ?? "/admin");

  return (
    <>
      <AuthHeading title="Welcome back">Sign in with your staff email and password.</AuthHeading>
      <SignInForm next={next} />
    </>
  );
}
