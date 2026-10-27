"use server";

import { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import type { ProductDetailView } from "@/lib/catalog-types";
import { getProductBySlug } from "@/server/catalog";
import { runAction } from "@/server/session";

/** Product details for the quick-view window on product cards (published products only). */
export async function getQuickView(input: { slug: string }): Promise<ActionResult<ProductDetailView>> {
  return runAction("catalog.quickView", async () => {
    const slug = z.string().trim().min(1).max(120).safeParse(input.slug);
    if (!slug.success) return fail("Product not found.");
    const product = await getProductBySlug(slug.data);
    if (!product) return fail("This product is no longer available.");
    return ok(product);
  });
}
