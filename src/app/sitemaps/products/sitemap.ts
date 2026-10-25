import type { MetadataRoute } from "next";
import { productsSitemap } from "@/server/sitemaps";

export const revalidate = 3600;

export default function sitemap(): Promise<MetadataRoute.Sitemap> {
  return productsSitemap();
}
