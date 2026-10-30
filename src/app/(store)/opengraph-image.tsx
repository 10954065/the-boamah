import { siteUrl } from "@/lib/utils";
import { OG_ALT, OG_SIZE, OG_TYPE, photoForCard, shopCard } from "@/server/og-image";

export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = OG_TYPE;

/** The link preview for the home page and any shop page without its own. */
export default async function Image() {
  return shopCard({
    title: "Groceries delivered to your door",
    detail: "Rice, cooking oil, breakfast, juices, snacks and household basics, ordered online.",
    photo: await photoForCard("/images/banners/hero-products.webp"),
    domain: new URL(siteUrl()).host,
  });
}
