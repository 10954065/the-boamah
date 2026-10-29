import { redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { SignOutButton } from "@/components/account/account-forms";
import { LogoMark } from "@/components/brand/logo";
import { prisma } from "@/lib/db";
import { hasPermission, ROLE_LABELS } from "@/lib/permissions";
import { getCurrentUser } from "@/server/session";

/** Till home. The selling screen is built on this page in the next phase. */
export default async function PosHomePage() {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "pos:sell")) redirect("/pos/login");
  const till = await prisma.posTill.findFirst({ where: { isActive: true }, orderBy: { code: "asc" }, select: { code: true, name: true } });

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center gap-3 border-b border-line bg-surface px-4 py-3">
        <LogoMark className="h-8 w-8" />
        <div className="min-w-0">
          <p className="font-display font-extrabold leading-tight">{till ? `Till ${till.code} · ${till.name}` : "No till set up"}</p>
          <p className="truncate text-xs text-ink-muted">
            {user.name} · {ROLE_LABELS[user.role]}
          </p>
        </div>
        <SignOutButton className="ml-auto" />
      </header>
      <main id="main" className="flex flex-1 items-center justify-center p-6">
        <div className="max-w-md rounded-lg border border-line bg-surface p-6 text-center shadow-[var(--shadow-card)]">
          <CheckCircle2 className="mx-auto h-10 w-10 text-leaf-600" aria-hidden="true" />
          <h1 className="mt-3 font-display text-xl font-extrabold">The till is connected</h1>
          <p className="mt-2 text-sm leading-6 text-ink-muted">
            It uses the shop&apos;s live products, prices and stock. The selling screen arrives in the next update.
          </p>
        </div>
      </main>
    </div>
  );
}
