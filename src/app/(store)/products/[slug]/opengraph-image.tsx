import { formatMoney } from "@/lib/money";
import { siteUrl } from "@/lib/utils";
import { getProductBySlug } from "@/server/catalog";
import { OG_ALT, OG_SIZE, OG_TYPE, photoForCard, shopCard } from "@/server/og-image";

export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = OG_TYPE;

/** The link preview for a product: its photo, name, size and price. */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  const domain = new URL(siteUrl()).host;
  if (!product) return shopCard({ title: "Groceries delivered to your door", photo: null, domain });

  const variant = product.defaultVariant;
  const price = variant
    ? { now: formatMoney(variant.effectivePriceMinor), was: variant.effectivePriceMinor < variant.priceMinor ? formatMoney(variant.priceMinor) : null }
    : null;
  return shopCard({
    eyebrow: product.categoryName,
    title: product.name,
    detail: variant?.name ?? null,
    price,
    photo: await photoForCard(product.imageUrl),
    domain,
  });
}
