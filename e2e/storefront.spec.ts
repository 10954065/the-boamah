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

  test("unavailable products cannot be purchased", async ({ page }) => {
    await setStock("croissants", 0);
    await page.goto("/products/croissants");
    await expect(page.getByText("Currently unavailable.")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Add to cart$/ })).toHaveCount(0);
    await setStock("croissants", 12_000);
  });
});
