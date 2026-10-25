import "server-only";
import type { BannerPlacement, PromoBanner } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

/** Active banners whose schedule includes now. */
export async function getActiveBanners(placement: BannerPlacement, limit = 3): Promise<PromoBanner[]> {
  const now = new Date();
  return prisma.promoBanner.findMany({
    where: {
      placement,
      isActive: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    take: limit,
  });
}
