import "server-only";
import type { DeliveryZone } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

export async function getActiveZones(): Promise<DeliveryZone[]> {
  return prisma.deliveryZone.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}
