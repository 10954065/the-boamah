import type { MetadataRoute } from "next";
import { categoriesSitemap } from "@/server/sitemaps";

// Rendered on request: the build has no database access (see docs/DEPLOYMENT.md).
export const dynamic = "force-dynamic";

export default function sitemap(): Promise<MetadataRoute.Sitemap> {
  return categoriesSitemap();
}
