import { expect, test } from "@playwright/test";
import { setStock } from "./db";

test.describe("storefront", () => {
  test("homepage renders hero, categories and products", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Shop by category" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Juices/ }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Featured this week" })).toBeVisible();
  });

  test("the hero grid shows live products, rotates them and can be paused", async ({ page }) => {
    await page.goto("/");
    const grid = page.getByRole("group", { name: "Products in the shop" });
    const tiles = grid.getByRole("link");
    await expect(tiles).toHaveCount(6);
    const shown = () => tiles.evaluateAll((links) => links.map((a) => a.getAttribute("href")));
    const first = await shown();
    expect(new Set(first).size).toBe(6);

    await page.mouse.move(0, 0); // keep the pointer off the grid, which pauses it
    await expect.poll(shown, { timeout: 8000 }).not.toEqual(first);

    await grid.getByRole("button", { name: "Pause the product slideshow" }).click();
    await page.mouse.move(0, 0);
    await expect(grid.getByRole("button", { name: "Play the product slideshow" })).toBeVisible();
    const paused = await shown();
    await page.waitForTimeout(3500);
    expect(await shown()).toEqual(paused);
  });

  test("search finds real products and shows a helpful empty state", async ({ page }) => {
    await page.goto("/shop?q=rice");
    await expect(page.getByRole("link", { name: "Royal Basmati Rice" })).toBeVisible();
    await page.goto("/shop?q=zzzznotaproduct");
    await expect(page.getByRole("heading", { name: /We couldn't find/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Browse categories" })).toBeVisible();
  });

  test("category filtering and sorting keep state in the URL", async ({ page }) => {
    await page.goto("/categories/juices-drinks?sort=price-asc");
    await expect(page.getByRole("heading", { level: 1, name: "Juices & Drinks" })).toBeVisible();
    await expect(page.getByLabel("Sort by")).toHaveValue("price-asc");
    await expect(page.locator("article").first()).toContainText("GH₵");
  });

  test("product detail page loads with price and add to cart", async ({ page }) => {
    await page.goto("/products/quaker-quick-oats");
    await expect(page.getByRole("heading", { level: 1, name: "Quaker Quick 1-Minute Oats" })).toBeVisible();
    await expect(page.getByText("per box").first()).toBeVisible();
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
    expect(categories).toMatch(/<loc>[^<]*\/categories\/juices-drinks<\/loc>/);
    expect(products).toMatch(/<loc>[^<]*\/products\/royal-basmati-rice<\/loc>/);
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

  test("the menu marks the current page and / jumps to search", async ({ page }) => {
    await page.goto("/shop");
    const menu = page.getByRole("navigation", { name: "Main" });
    await expect(menu.getByRole("link", { name: "Shop", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(menu.getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current", "page");

    await page.locator("body").press("/");
    await expect(page.getByRole("combobox", { name: "Search groceries" }).first()).toBeFocused();
  });

  test("recently viewed products follow the shopper between pages", async ({ page }) => {
    await page.goto("/products/royal-basmati-rice");
    await page.goto("/products/quaker-quick-oats");
    const recent = page.getByRole("region", { name: "Recently viewed" });
    await expect(recent.getByRole("link", { name: "Royal Basmati Rice" })).toBeVisible();
    await expect(recent.getByRole("link", { name: "Quaker Quick 1-Minute Oats" })).toHaveCount(0);

    await page.goto("/");
    const home = page.getByRole("region", { name: "Pick up where you left off" });
    await expect(home.getByRole("link", { name: "Quaker Quick 1-Minute Oats" })).toBeVisible();
    await expect(home.getByRole("link", { name: "Royal Basmati Rice" })).toBeVisible();
  });

  test("back to top appears after scrolling and returns to the top", async ({ page }) => {
    await page.goto("/shop");
    const button = page.getByRole("button", { name: "Back to top" });
    await expect(button).toHaveCount(0);
    await page.mouse.wheel(0, 2500);
    await expect(button).toBeVisible();
    await button.click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(50);
  });

  test("unavailable products cannot be purchased", async ({ page }) => {
    await setStock("famous-amos-cookies", 0);
    await page.goto("/products/famous-amos-cookies");
    await expect(page.getByText("Currently unavailable.")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Add to cart$/ })).toHaveCount(0);
    await setStock("famous-amos-cookies", 12_000);
  });
});
