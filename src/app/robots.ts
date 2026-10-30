import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/utils";
import { SITEMAPS, sitemapUrl } from "@/server/sitemaps";

/** Private and per-visitor pages. They also carry a noindex robots tag. */
const PRIVATE_PATHS = [
  "/cart",
  "/checkout",
  "/orders",
  "/track-order",
  "/api",
  "/dev",
];

/**
 * Search, sort and filter combinations repeat the same products and are marked
 * noindex, so crawlers are kept out of them. Pagination stays crawlable.
 */
const LISTING_PARAMS = ["q", "sort", "category", "min", "max", "stock", "sale"].map((param) => `/*?*${param}=`);

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: [...PRIVATE_PATHS, ...LISTING_PARAMS] }],
    sitemap: [siteUrl("/sitemap.xml"), ...SITEMAPS.map(sitemapUrl)],
  };
}
