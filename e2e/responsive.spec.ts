import { expect, test } from "@playwright/test";

const PAGES = ["/", "/shop", "/categories", "/categories/juices-drinks", "/products/royal-basmati-rice", "/offers", "/cart", "/track-order", "/policies/delivery"];
const WIDTHS = [320, 375, 412, 768, 1024, 1440];

test.describe("responsive layout", () => {
  for (const path of PAGES) {
    test(`${path} has no overflow, broken images or console errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      page.on("response", (response) => {
        if (response.status() >= 500) errors.push(`${response.status()} ${response.url()}`);
      });

      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path, { waitUntil: "networkidle" });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(0);
      }

      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 600) {
          window.scrollTo(0, y);
          await new Promise((resolve) => setTimeout(resolve, 60));
        }
      });
      await page.waitForLoadState("networkidle");
      const broken = await page.evaluate(() => [...document.images].filter((img) => img.complete && img.naturalWidth === 0).map((img) => img.src));
      expect(broken).toEqual([]);
      expect(errors).toEqual([]);
    });
  }

  test("mobile menu opens and is keyboard dismissible", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/");
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.getByRole("dialog", { name: "Menu" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Menu" })).toBeHidden();
  });

  test("the phone bottom menu reaches search, the cart and categories", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto("/products/royal-basmati-rice");
    const menu = page.getByRole("navigation", { name: "Shortcuts" });
    await menu.getByRole("button", { name: "Search" }).click();
    await expect(page.getByRole("combobox", { name: "Search groceries" }).last()).toBeFocused();

    await menu.getByRole("link", { name: /^Cart, / }).click();
    await expect(page.getByRole("dialog", { name: /Your cart/ })).toBeVisible();
    await page.keyboard.press("Escape");

    await menu.getByRole("link", { name: "Categories" }).click();
    await expect(page).toHaveURL(/\/categories$/);
    await expect(menu.getByRole("link", { name: "Categories" })).toHaveAttribute("aria-current", "page");
  });

  test("on phones the add-to-cart bar appears once the main button scrolls away", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto("/products/quaker-quick-oats");
    const barButton = page.getByRole("button", { name: "Add 1 box of Quaker Quick 1-Minute Oats to cart" });
    await expect(barButton).toHaveCount(0);

    await page.getByRole("heading", { name: "Product description" }).scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 400);
    await expect(barButton).toBeVisible();
    await barButton.click();
    await expect(page.getByRole("dialog", { name: /Your cart/ })).toBeVisible();
  });
});
