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

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });

  test("no text field is small enough to make the phone zoom in", async ({ page }) => {
    for (const path of ["/", "/track-order", "/contact", "/categories/juices-drinks"]) {
      await page.goto(path);
      const small = await page
        .locator("input:not([type=hidden], [type=checkbox], [type=radio]), select, textarea")
        .evaluateAll((fields) => fields.filter((field) => parseFloat(getComputedStyle(field).fontSize) < 16).map((field) => field.getAttribute("name") ?? field.id));
      expect(small, `fields under 16px on ${path}`).toEqual([]);
    }
  });

  test("the bottom menu's search leaves the page where it was", async ({ page }) => {
    await page.goto("/shop", { waitUntil: "networkidle" });
    await page.evaluate(() => window.scrollTo({ top: 700, behavior: "instant" }));
    await page.getByRole("navigation", { name: "Shortcuts" }).getByRole("button", { name: "Search" }).click();
    await expect(page.getByRole("combobox", { name: "Search groceries" }).last()).toBeFocused();
    expect(await page.evaluate(() => window.scrollY)).toBe(700);
  });

  test("search suggestions can be scrolled without opening one", async ({ page }) => {
    await page.goto("/");
    const search = page.getByRole("combobox", { name: "Search groceries" }).last();
    await search.fill("ju");
    const list = page.getByRole("listbox", { name: "Search suggestions" });
    await expect(list.getByRole("option").first()).toBeVisible();
    const box = (await list.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(844);
    // A finger going down to scroll the list must not open a product.
    await list.getByRole("option").first().dispatchEvent("pointerdown");
    await page.waitForTimeout(800);
    await expect(page).toHaveURL(/\/$/);
    await list.getByRole("option").first().click();
    await expect(page).toHaveURL(/\/products\//);
  });

  test("a category page starts with its products", async ({ page }) => {
    await page.goto("/categories/juices-drinks", { waitUntil: "networkidle" });
    const top = await page.locator("main article").first().evaluate((card) => card.getBoundingClientRect().top);
    expect(top).toBeLessThan(420);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });

  test("the open category's chip is brought into view", async ({ page }) => {
    await page.goto("/categories/pet-food", { waitUntil: "networkidle" });
    await expect(page.getByRole("main").getByRole("navigation", { name: "Categories" }).getByRole("link", { name: "Pet Food" })).toBeInViewport({ ratio: 1 });
  });

  test("the category list fits most categories on the first screen", async ({ page }) => {
    await page.goto("/categories", { waitUntil: "networkidle" });
    const inView = await page.locator("main ul li a").evaluateAll((cards) => cards.filter((card) => card.getBoundingClientRect().bottom <= window.innerHeight - 60).length);
    expect(inView).toBeGreaterThanOrEqual(6);
  });

  test("filters open in their own panel and apply", async ({ page }) => {
    await page.goto("/categories/juices-drinks");
    await page.getByRole("button", { name: "Filters" }).click();
    const filters = page.getByRole("dialog", { name: "Filters" });
    await filters.getByLabel("In stock only").check();
    await filters.getByRole("button", { name: "Apply filters" }).click();
    await expect(page).toHaveURL(/stock=1/);
    await expect(page.getByRole("button", { name: "Filters, 1 on" })).toBeVisible();
  });
});
