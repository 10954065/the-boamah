import type { MetadataRoute } from "next";
import { pagesSitemap } from "@/server/sitemaps";

export const revalidate = 3600;

export default function sitemap(): Promise<MetadataRoute.Sitemap> {
  return pagesSitemap();
}
