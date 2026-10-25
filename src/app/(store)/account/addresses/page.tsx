import type { Metadata } from "next";
import { AddressManager } from "@/components/account/account-forms";
import { prisma } from "@/lib/db";
import { getActiveZones } from "@/server/delivery";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "My addresses", robots: { index: false } };

export default async function AddressesPage() {
  const user = await requireUser("/account/addresses");
  const [addresses, zones] = await Promise.all([
    prisma.address.findMany({ where: { userId: user.id }, orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }] }),
    getActiveZones(),
  ]);
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Saved addresses</h1>
      <AddressManager
        addresses={addresses.map((a) => ({
          id: a.id,
          label: a.label,
          recipientName: a.recipientName,
          phone: a.phone,
          zoneId: a.zoneId,
          city: a.city,
          area: a.area,
          addressLine: a.addressLine,
          details: a.details,
          isDefault: a.isDefault,
        }))}
        zones={zones.map((z) => ({ id: z.id, name: z.name, region: z.region }))}
      />
    </div>
  );
}
