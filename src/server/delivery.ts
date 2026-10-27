import "server-only";
import type { DeliveryZone } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/server/session";

export interface FreeDeliveryTarget {
  thresholdMinor: number;
  zoneName: string;
  /** True when the zone comes from the customer's default address. */
  isYourArea: boolean;
}

/**
 * The free-delivery amount to show in the cart: the zone of the customer's
 * default address when it offers free delivery, otherwise the active zone
 * with the lowest free-delivery amount. Null when no zone offers it.
 */
export async function getFreeDeliveryTarget(): Promise<FreeDeliveryTarget | null> {
  const user = await getCurrentUser();
  if (user) {
    const address = await prisma.address.findFirst({
      where: { userId: user.id, isDefault: true, zone: { isActive: true, freeDeliveryThresholdMinor: { not: null } } },
      select: { zone: { select: { name: true, freeDeliveryThresholdMinor: true } } },
    });
    if (address?.zone?.freeDeliveryThresholdMinor) {
      return { thresholdMinor: address.zone.freeDeliveryThresholdMinor, zoneName: address.zone.name, isYourArea: true };
    }
  }
  const zone = await prisma.deliveryZone.findFirst({
    where: { isActive: true, freeDeliveryThresholdMinor: { not: null } },
    orderBy: { freeDeliveryThresholdMinor: "asc" },
    select: { name: true, freeDeliveryThresholdMinor: true },
  });
  return zone?.freeDeliveryThresholdMinor ? { thresholdMinor: zone.freeDeliveryThresholdMinor, zoneName: zone.name, isYourArea: false } : null;
}

export async function getActiveZones(): Promise<DeliveryZone[]> {
  return prisma.deliveryZone.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}
