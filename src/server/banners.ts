import "server-only";
import type { BannerPlacement, PromoBanner } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { storefrontCached } from "@/server/storefront-cache";

/** Active banners whose schedule includes now. */
export function getActiveBanners(placement: BannerPlacement, limit = 3): Promise<PromoBanner[]> {
  return storefrontCached(`banners:${placement}:${limit}`, () => loadBanners(placement, limit));
}

function loadBanners(placement: BannerPlacement, limit: number): Promise<PromoBanner[]> {
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
