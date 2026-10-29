import { redirect } from "next/navigation";
import { CircleOff } from "lucide-react";
import { TillApp } from "@/components/pos/till-app";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { openShiftForTill } from "@/server/pos/shifts";
import { getCurrentUser } from "@/server/session";
import { getStoreSettings } from "@/server/settings";

/** The till: who is signed in, which till this is, its open shift and the shop's details for receipts. */
export default async function PosHomePage() {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "pos:sell")) redirect("/pos/login");
  const till = await prisma.posTill.findFirst({ where: { isActive: true }, orderBy: { code: "asc" }, select: { code: true, name: true, lastReceiptSeq: true } });

  if (!till) {
    return (
      <main id="main" className="flex min-h-dvh items-center justify-center p-6">
        <div className="max-w-md rounded-lg border border-line bg-surface p-6 text-center shadow-[var(--shadow-card)]">
          <CircleOff className="mx-auto h-10 w-10 text-ink-subtle" aria-hidden="true" />
          <h1 className="mt-3 font-display text-xl font-extrabold">No till is switched on</h1>
          <p className="mt-2 text-sm leading-6 text-ink-muted">A manager needs to switch a till on before sales can be taken here.</p>
        </div>
      </main>
    );
  }

  const [initialShift, settings] = await Promise.all([openShiftForTill(till.code), getStoreSettings()]);
  return (
    <TillApp
      till={till}
      cashier={{ id: user.id, name: user.name, canManage: hasPermission(user.role, "pos:manage") }}
      initialShift={initialShift}
      shop={{ name: settings.storeName, address: settings.address, phone: settings.contactPhone }}
    />
  );
}
