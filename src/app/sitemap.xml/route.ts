import { sitemapIndex } from "@/server/sitemaps";

// Rendered on request: the build has no database access (see docs/DEPLOYMENT.md).
export const dynamic = "force-dynamic";

const escapeXml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** Sitemap index: points search engines at the page, category and product sitemaps. */
export async function GET() {
  const entries = await sitemapIndex();
  const sitemaps = entries
    .map((entry) => {
      const lastmod = entry.lastModified ? `\n    <lastmod>${entry.lastModified.toISOString()}</lastmod>` : "";
      return `  <sitemap>\n    <loc>${escapeXml(entry.url)}</loc>${lastmod}\n  </sitemap>`;
    })
    .join("\n");
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemaps}\n</sitemapindex>\n`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
