import { ZoneManager } from "@/components/admin/store-managers";
import { AdminHeader } from "@/components/admin/ui";
import { prisma } from "@/lib/db";
import { formatMoney, minorToDecimalString } from "@/lib/money";
import { requireStaffPage } from "@/server/session";

export const metadata = { title: "Delivery zones" };

export default async function DeliveryZonesPage() {
  await requireStaffPage("delivery:manage", "/admin/delivery");
  const zones = await prisma.deliveryZone.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  return (
    <>
      <AdminHeader title="Delivery zones" description="Customers can only check out for delivery to an active zone. Paused zones stay in order history." />
      <ZoneManager
        zones={zones.map((z) => ({
          id: z.id,
          name: z.name,
          region: z.region,
          areas: z.areas.join(", "),
          fee: minorToDecimalString(z.feeMinor),
          minOrder: z.minOrderMinor ? minorToDecimalString(z.minOrderMinor) : "",
          freeFrom: z.freeDeliveryThresholdMinor !== null ? minorToDecimalString(z.freeDeliveryThresholdMinor) : "",
          estimatedDelivery: z.estimatedDelivery ?? "",
          sortOrder: z.sortOrder,
          isActive: z.isActive,
          summary: `Fee ${formatMoney(z.feeMinor)}${z.minOrderMinor ? ` · min order ${formatMoney(z.minOrderMinor)}` : ""}${z.freeDeliveryThresholdMinor !== null ? ` · free from ${formatMoney(z.freeDeliveryThresholdMinor)}` : ""}`,
        }))}
      />
    </>
  );
}
