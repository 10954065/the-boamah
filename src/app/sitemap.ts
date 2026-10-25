import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";
import { siteUrl } from "@/lib/utils";
import { getStoreSettings } from "@/server/settings";

export const revalidate = 3600;

/** Only published products in active categories and published policies are listed. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, categories, settings] = await Promise.all([
    prisma.product.findMany({
      where: { status: "PUBLISHED", category: { isActive: true }, variants: { some: { isActive: true } } },
      select: { slug: true, updatedAt: true },
    }),
    prisma.category.findMany({ where: { isActive: true }, select: { slug: true, updatedAt: true } }),
    getStoreSettings(),
  ]);

  const policies = (
    [
      ["delivery", settings.deliveryPolicy],
      ["returns", settings.returnsPolicy],
      ["privacy", settings.privacyPolicy],
      ["terms", settings.termsPolicy],
    ] as const
  )
    .filter(([, body]) => Boolean(body))
    .map(([slug]) => ({ url: siteUrl(`/policies/${slug}`), changeFrequency: "monthly" as const, priority: 0.3 }));

  return [
    { url: siteUrl("/"), changeFrequency: "daily", priority: 1 },
    { url: siteUrl("/shop"), changeFrequency: "daily", priority: 0.9 },
    { url: siteUrl("/offers"), changeFrequency: "daily", priority: 0.8 },
    { url: siteUrl("/categories"), changeFrequency: "weekly", priority: 0.7 },
    { url: siteUrl("/contact"), changeFrequency: "monthly", priority: 0.3 },
    ...categories.map((c) => ({ url: siteUrl(`/categories/${c.slug}`), lastModified: c.updatedAt, changeFrequency: "daily" as const, priority: 0.7 })),
    ...products.map((p) => ({ url: siteUrl(`/products/${p.slug}`), lastModified: p.updatedAt, changeFrequency: "weekly" as const, priority: 0.6 })),
    ...policies,
  ];
}
