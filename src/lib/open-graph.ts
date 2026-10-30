import type { Metadata } from "next";

export const STORE_NAME = "The Boamah's Online Grocery Shop";

/**
 * Link preview text for a page. A page's openGraph replaces the layout's
 * whole, so the site name and locale are repeated here. The picture comes
 * from the opengraph-image file nearest the page.
 */
export function pageOpenGraph(title: string, description?: string | null): NonNullable<Metadata["openGraph"]> {
  return { type: "website", siteName: STORE_NAME, locale: "en_GH", title, ...(description ? { description } : {}) };
}
