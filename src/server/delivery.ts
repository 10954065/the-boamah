import "server-only";
import type { DeliveryZone } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { storefrontCached } from "@/server/storefront-cache";

export interface FreeDeliveryTarget {
  thresholdMinor: number;
  zoneName: string;
}

/**
 * The free-delivery amount to show in the cart: the active zone with the
 * lowest free-delivery amount. Null when no zone offers it.
 */
export async function getFreeDeliveryTarget(): Promise<FreeDeliveryTarget | null> {
  const zone = await prisma.deliveryZone.findFirst({
    where: { isActive: true, freeDeliveryThresholdMinor: { not: null } },
    orderBy: { freeDeliveryThresholdMinor: "asc" },
    select: { name: true, freeDeliveryThresholdMinor: true },
  });
  return zone?.freeDeliveryThresholdMinor ? { thresholdMinor: zone.freeDeliveryThresholdMinor, zoneName: zone.name } : null;
}

/** The cheapest active zone's fee, for the delivery cost in product data. Null when no zone is active. */
export function getLowestDeliveryFee(): Promise<number | null> {
  return storefrontCached("delivery:lowest-fee", async () => {
    const zone = await prisma.deliveryZone.findFirst({ where: { isActive: true }, orderBy: { feeMinor: "asc" }, select: { feeMinor: true } });
    return zone?.feeMinor ?? null;
  });
}

export async function getActiveZones(): Promise<DeliveryZone[]> {
  return prisma.deliveryZone.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}
