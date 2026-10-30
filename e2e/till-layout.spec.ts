import { expect, test, type Locator, type Page } from "@playwright/test";
import { db } from "./db";
import { createStaff, signInToTill } from "./staff";

/** Common counter screens, as the browser sees them once Windows scaling and the browser's own bars are taken off. */
const SCREENS = [
  { name: "a laptop", width: 1366, height: 650 },
  { name: "an HD screen", width: 1280, height: 720 },
  { name: "a laptop scaled to 125%", width: 1024, height: 600 },
  { name: "a laptop scaled to 150%", width: 912, height: 560 },
  { name: "a tablet upright", width: 800, height: 1280 },
];
const PHONE = { width: 390, height: 844 };
const PROMPT = "Type a product name or scan a barcode";

async function assertNothingSpills(page: Page, label: string): Promise<void> {
  const spill = await page.evaluate(() => ({
    wide: document.documentElement.scrollWidth - window.innerWidth,
    tall: document.documentElement.scrollHeight - window.innerHeight,
    scrolled: window.scrollX + window.scrollY,
  }));
  expect(spill, `page spills on ${label}`).toEqual({ wide: 0, tall: 0, scrolled: 0 });
}

async function cardsInView(check: Locator): Promise<number> {
  return check.evaluate((frame) => {
    const scroller = frame.closest("main")!.getBoundingClientRect();
    return [...frame.querySelectorAll("li")].filter((card) => {
      const box = card.getBoundingClientRect();
      return box.height > 0 && box.top >= scroller.top && box.bottom <= scroller.bottom;
    }).length;
  });
}

test.describe("till layout", () => {
  const stamp = Date.now();
  const email = `till.layout.e2e.${stamp}@example.com`;
  let cashierId = "";

  test.beforeAll(async () => {
    // A shift left open on the till by an earlier run would stand in the way.
    await db.posShift.updateMany({ where: { closedAt: null, till: { code: "T1" } }, data: { closedAt: new Date(), notes: "Closed by the e2e run" } });
    cashierId = await createStaff("Ama Layout", email);
  });

  test.afterAll(async () => {
    await db.posShift.deleteMany({ where: { cashierId } });
    await db.auditLog.deleteMany({ where: { actorId: cashierId } });
    await db.user.delete({ where: { id: cashierId } });
  });

  test("products stay out of the way until typed, and what is bought shows with its photo", async ({ page }) => {
    await signInToTill(page, email);
    await page.goto("/pos");
    await page.getByLabel("Cash in the drawer").fill("200");
    await page.getByRole("button", { name: /^Open the till with/ }).click();

    // Nothing is listed until the cashier asks for it.
    const main = page.getByRole("main");
    const search = page.getByRole("searchbox", { name: "Search products or scan a barcode" });
    await expect(main.getByText(PROMPT)).toBeVisible();
    await expect(main.getByRole("listitem")).toHaveCount(0);

    // Typing brings up the matches with their photos.
    await search.fill("oil");
    const matches = main.getByRole("listitem");
    await expect(matches.first()).toBeVisible();
    await expect(matches.first().locator("img")).toBeVisible();
    expect(await matches.count()).toBeLessThan(6);

    // Each kind bought goes on the screen for checking, and the search is ready for the next one.
    const check = page.getByRole("region", { name: "Check these against the goods" });
    const kinds = ["Wesson", "Kellogg", "Dove Cool"];
    for (const name of kinds) {
      await search.fill(name);
      await main.getByRole("listitem").getByRole("button").first().click();
      await expect(search).toHaveValue("");
      await expect(check.getByText(name)).toBeVisible();
    }
    await expect(check.getByRole("listitem")).toHaveCount(kinds.length);
    await expect(check.locator("img").first()).toBeVisible();
    const brokenPhotos = await check.locator("img").evaluateAll((images) => images.filter((image) => !(image as HTMLImageElement).complete).length);
    expect(brokenPhotos).toBe(0);

    // Tapping a card changes how many; the card shows the new amount.
    await check.getByRole("button", { name: /Wesson/ }).click();
    const quantity = page.getByRole("dialog");
    await quantity.getByLabel("Quantity").fill("3");
    await quantity.getByRole("button", { name: "Update" }).click();
    await expect(check.getByRole("listitem").filter({ hasText: "Wesson" })).toContainText("3");

    // A category can still be opened for goods that are hard to spell, and closed again.
    await page.getByRole("button", { name: "Snacks & Cookies" }).click();
    await expect(check).toBeHidden();
    await expect(main.getByRole("listitem").first()).toBeVisible();
    await page.getByRole("button", { name: "Snacks & Cookies" }).click();
    await expect(check).toBeVisible();

    await page.getByRole("region", { name: "Current sale" }).getByRole("button", { name: "Clear" }).click();
    await page.getByRole("region", { name: "Current sale" }).getByRole("button", { name: "Tap again" }).click();
    await expect(main.getByText(PROMPT)).toBeVisible();
  });

  test("every frame fits on the screen with a long, large sale on the till", async ({ page }) => {
    await signInToTill(page, email);
    await page.goto("/pos");

    const main = page.getByRole("main");
    const search = page.getByRole("searchbox", { name: "Search products or scan a barcode" });
    await expect(main.getByText(PROMPT)).toBeVisible();

    // A five figure total is the widest the Charge button gets.
    await search.fill("Ensure Original");
    await main.getByRole("listitem").getByRole("button").first().click();
    const sale = page.getByRole("region", { name: "Current sale" });
    await sale.getByRole("button", { name: /^Quantity of Ensure Original/ }).click();
    await page.getByRole("dialog").getByLabel("Quantity").fill("13");
    await page.getByRole("dialog").getByRole("button", { name: "Update" }).click();
    for (const name of ["Royal Basmati", "Wesson", "Kellogg", "Dove Cool", "Irish Spring", "Purina", "Welch's Fruit", "Famous Amos"]) {
      await search.fill(name);
      await main.getByRole("listitem").getByRole("button").first().click();
    }

    const check = page.getByRole("region", { name: "Check these against the goods" });
    for (const screen of SCREENS) {
      await page.setViewportSize({ width: screen.width, height: screen.height });
      await expect(sale).toBeVisible();
      await assertNothingSpills(page, screen.name);
      await expect(sale.getByRole("button", { name: /^Charge/ })).toBeInViewport({ ratio: 1 });
      await expect(sale.getByRole("button", { name: "Put this sale on hold" })).toBeInViewport({ ratio: 1 });
      await expect(search).toBeInViewport({ ratio: 1 });
      expect(await cardsInView(check), `cards in view on ${screen.name}`).toBeGreaterThanOrEqual(4);

      const lines = await sale.getByRole("listitem").evaluateAll((items) => items.map((item) => item.getBoundingClientRect().height));
      expect(Math.max(...lines), `sale line height on ${screen.name}`).toBeLessThanOrEqual(72);
    }

    await page.setViewportSize(PHONE);
    await assertNothingSpills(page, "a phone");
    await expect(page.getByRole("button", { name: "View sale" })).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole("button", { name: /^Charge/ })).toBeInViewport({ ratio: 1 });
    expect(await cardsInView(check), "cards in view on a phone").toBeGreaterThanOrEqual(4);
  });
});
