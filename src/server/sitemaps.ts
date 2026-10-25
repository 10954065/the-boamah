import "server-only";
import type { MetadataRoute } from "next";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { siteUrl } from "@/lib/utils";
import { getStoreSettings } from "@/server/settings";

/**
 * Sitemaps listed in the /sitemap.xml index. Only pages a visitor can open
 * without signing in are included: published products in active categories,
 * active categories, and policies that have been written.
 */
export const SITEMAPS = ["pages", "categories", "products"] as const;
export type SitemapName = (typeof SITEMAPS)[number];

export const sitemapUrl = (name: SitemapName) => siteUrl(`/sitemaps/${name}/sitemap.xml`);

const LISTED_PRODUCT = {
  status: "PUBLISHED",
  category: { isActive: true },
  variants: { some: { isActive: true } },
} satisfies Prisma.ProductWhereInput;

const POLICIES = [
  ["delivery", "deliveryPolicy"],
  ["returns", "returnsPolicy"],
  ["privacy", "privacyPolicy"],
  ["terms", "termsPolicy"],
] as const;

const absolute = (url: string) => (/^https?:\/\//.test(url) ? url : siteUrl(url));

export async function pagesSitemap(): Promise<MetadataRoute.Sitemap> {
  const settings = await getStoreSettings();
  const policies = POLICIES.filter(([, field]) => Boolean(settings[field])).map(([slug]) => ({
    url: siteUrl(`/policies/${slug}`),
    lastModified: settings.updatedAt,
    changeFrequency: "monthly" as const,
    priority: 0.3,
  }));
  return [
    { url: siteUrl("/"), changeFrequency: "daily", priority: 1 },
    { url: siteUrl("/shop"), changeFrequency: "daily", priority: 0.9 },
    { url: siteUrl("/offers"), changeFrequency: "daily", priority: 0.8 },
    { url: siteUrl("/categories"), changeFrequency: "weekly", priority: 0.7 },
    { url: siteUrl("/contact"), lastModified: settings.updatedAt, changeFrequency: "monthly", priority: 0.3 },
    { url: siteUrl("/credits"), changeFrequency: "monthly", priority: 0.1 },
    ...policies,
  ];
}

export async function categoriesSitemap(): Promise<MetadataRoute.Sitemap> {
  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { slug: true, imageUrl: true, updatedAt: true },
  });
  return categories.map((c) => ({
    url: siteUrl(`/categories/${c.slug}`),
    lastModified: c.updatedAt,
    changeFrequency: "daily" as const,
    priority: 0.7,
    ...(c.imageUrl ? { images: [absolute(c.imageUrl)] } : {}),
  }));
}

/** One sitemap holds up to 50,000 URLs; split with generateSitemaps if the catalogue ever gets that big. */
export async function productsSitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await prisma.product.findMany({
    where: LISTED_PRODUCT,
    orderBy: { slug: "asc" },
    select: { slug: true, updatedAt: true, images: { orderBy: { sortOrder: "asc" }, select: { url: true } } },
  });
  return products.map((p) => ({
    url: siteUrl(`/products/${p.slug}`),
    lastModified: p.updatedAt,
    changeFrequency: "weekly" as const,
    priority: 0.6,
    ...(p.images.length ? { images: p.images.map((image) => absolute(image.url)) } : {}),
  }));
}

/** Entries for the sitemap index, each with the time its content last changed. */
export async function sitemapIndex(): Promise<{ url: string; lastModified: Date | null }[]> {
  const [settings, categories, products] = await Promise.all([
    getStoreSettings(),
    prisma.category.aggregate({ where: { isActive: true }, _max: { updatedAt: true } }),
    prisma.product.aggregate({ where: LISTED_PRODUCT, _max: { updatedAt: true } }),
  ]);
  const lastModified: Record<SitemapName, Date | null> = {
    pages: settings.updatedAt.getTime() > 0 ? settings.updatedAt : null,
    categories: categories._max.updatedAt,
    products: products._max.updatedAt,
  };
  return SITEMAPS.map((name) => ({ url: sitemapUrl(name), lastModified: lastModified[name] }));
}
