import { BannerManager } from "@/components/admin/marketing-managers";
import { AdminHeader } from "@/components/admin/ui";
import { prisma } from "@/lib/db";
import { requireStaffPage } from "@/server/session";

export const metadata = { title: "Banners" };

const toLocalInput = (date: Date | null) => (date ? new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : "");

export default async function BannersPage() {
  await requireStaffPage("promotions:manage", "/admin/banners");
  const banners = await prisma.promoBanner.findMany({ orderBy: [{ placement: "asc" }, { sortOrder: "asc" }] });
  return (
    <>
      <AdminHeader title="Homepage banners" description="The first active hero banner is shown at the top of the homepage; up to three promo tiles appear below the featured products." />
      <BannerManager
        banners={banners.map((b) => ({
          id: b.id,
          placement: b.placement,
          eyebrow: b.eyebrow ?? "",
          title: b.title,
          subtitle: b.subtitle ?? "",
          imageUrl: b.imageUrl,
          ctaLabel: b.ctaLabel ?? "",
          ctaHref: b.ctaHref ?? "",
          tone: (["leaf", "gold", "cream", "brand"].includes(b.tone) ? b.tone : "leaf") as "leaf" | "gold" | "cream" | "brand",
          startsAt: toLocalInput(b.startsAt),
          endsAt: toLocalInput(b.endsAt),
          sortOrder: b.sortOrder,
          isActive: b.isActive,
        }))}
      />
    </>
  );
}
