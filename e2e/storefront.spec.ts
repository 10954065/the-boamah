import { expect, test } from "@playwright/test";
import { setStock } from "./db";

test.describe("storefront", () => {
  test("homepage renders hero, categories and products", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Shop by category" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Vegetables/ }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Featured this week" })).toBeVisible();
  });

  test("search finds real products and shows a helpful empty state", async ({ page }) => {
    await page.goto("/shop?q=rice");
    await expect(page.getByRole("link", { name: "Jasmine Rice" })).toBeVisible();
    await page.goto("/shop?q=zzzznotaproduct");
    await expect(page.getByRole("heading", { name: /We couldn't find/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Browse categories" })).toBeVisible();
  });

  test("category filtering and sorting keep state in the URL", async ({ page }) => {
    await page.goto("/categories/fruits?sort=price-asc");
    await expect(page.getByRole("heading", { level: 1, name: "Fruits" })).toBeVisible();
    await expect(page.getByLabel("Sort by")).toHaveValue("price-asc");
    await expect(page.locator("article").first()).toContainText("GH₵");
  });

  test("product detail page loads with price and add to cart", async ({ page }) => {
    await page.goto("/products/tomatoes");
    await expect(page.getByRole("heading", { level: 1, name: "Fresh Tomatoes" })).toBeVisible();
    await expect(page.getByText("per kg").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^Add to cart$/ })).toBeEnabled();
  });

  test("sitemap index links valid page, category and product sitemaps", async ({ request }) => {
    const index = await request.get("/sitemap.xml");
    expect(index.ok()).toBe(true);
    expect(index.headers()["content-type"]).toContain("xml");
    const paths = [...(await index.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!).pathname);
    expect(paths).toEqual(["/sitemaps/pages/sitemap.xml", "/sitemaps/categories/sitemap.xml", "/sitemaps/products/sitemap.xml"]);

    const bodies = await Promise.all(paths.map(async (path) => (await request.get(path)).text()));
    for (const body of bodies) expect(body).toContain("<urlset");
    const [pages, categories, products] = bodies as [string, string, string];
    expect(pages).toMatch(/<loc>[^<]*\/shop<\/loc>/);
    expect(categories).toMatch(/<loc>[^<]*\/categories\/fruits<\/loc>/);
    expect(products).toMatch(/<loc>[^<]*\/products\/jasmine-rice<\/loc>/);
    expect(products).toContain("<image:loc>");
    expect(products).not.toContain("/admin");
  });

  test("robots.txt lists every sitemap and keeps crawlers out of private pages", async ({ request }) => {
    const robots = await (await request.get("/robots.txt")).text();
    for (const path of ["/sitemap.xml", "/sitemaps/pages/sitemap.xml", "/sitemaps/categories/sitemap.xml", "/sitemaps/products/sitemap.xml"]) {
      expect(robots).toMatch(new RegExp(`Sitemap: \\S+${path.replace(/\./g, "\\.")}`));
    }
    for (const rule of ["Disallow: /admin", "Disallow: /account", "Disallow: /checkout", "Disallow: /*?*sort="]) expect(robots).toContain(rule);
    expect(robots).not.toMatch(/Disallow: \/products/);
  });

  test("unavailable products cannot be purchased", async ({ page }) => {
    await setStock("croissants", 0);
    await page.goto("/products/croissants");
    await expect(page.getByText("Currently unavailable.")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Add to cart$/ })).toHaveCount(0);
    await setStock("croissants", 12_000);
  });
});
