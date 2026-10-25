import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-soft">
      <header className="container-page flex h-20 items-center justify-between">
        <Logo />
        <Link href="/shop" className="text-sm font-medium text-ink-muted hover:text-brand-700">
          Continue shopping →
        </Link>
      </header>
      <main id="main" className="container-page flex flex-1 items-start justify-center pb-16 pt-4 sm:pt-10">
        <div className="w-full max-w-md rounded-lg border border-line bg-surface p-6 shadow-[var(--shadow-card)] sm:p-8">{children}</div>
      </main>
    </div>
  );
}
