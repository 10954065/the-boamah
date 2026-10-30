import { siteUrl } from "@/lib/utils";
import { getCategoryBySlug } from "@/server/catalog";
import { OG_ALT, OG_SIZE, OG_TYPE, photoForCard, shopCard } from "@/server/og-image";

export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = OG_TYPE;

/** The link preview for a category: its photo, name and how many products it has. */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  const domain = new URL(siteUrl()).host;
  if (!category) return shopCard({ title: "Groceries delivered to your door", photo: null, domain });

  return shopCard({
    eyebrow: `${category.productCount} ${category.productCount === 1 ? "product" : "products"}`,
    title: category.name,
    detail: category.description,
    photo: await photoForCard(category.imageUrl),
    domain,
  });
}
