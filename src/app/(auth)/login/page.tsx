import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/auth/auth-forms";
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
      <h1 className="text-2xl font-extrabold">Staff sign in</h1>
      <p className="mt-1 text-sm text-ink-muted">For The Boamah&rsquo;s staff.</p>
      <div className="mt-6">
        <SignInForm next={next} />
      </div>
    </>
  );
}
