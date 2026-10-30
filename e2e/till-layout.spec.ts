import { expect, test, type Page } from "@playwright/test";
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
const MIN_TILES_IN_VIEW = 12;

async function assertNothingSpills(page: Page, label: string): Promise<void> {
  const spill = await page.evaluate(() => ({
    wide: document.documentElement.scrollWidth - window.innerWidth,
    tall: document.documentElement.scrollHeight - window.innerHeight,
    scrolled: window.scrollX + window.scrollY,
  }));
  expect(spill, `page spills on ${label}`).toEqual({ wide: 0, tall: 0, scrolled: 0 });
}

async function tilesInView(page: Page): Promise<number> {
  return page.getByRole("main").evaluate((main) => {
    const frame = main.getBoundingClientRect();
    return [...main.querySelectorAll("li button")].filter((tile) => {
      const box = tile.getBoundingClientRect();
      return box.height > 0 && box.top >= frame.top && box.bottom <= frame.bottom;
    }).length;
  });
}

test.describe("till layout", () => {
  const email = `till.layout.e2e.${Date.now()}@example.com`;
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

  test("every frame fits on the screen with a long, large sale on the till", async ({ page }) => {
    await signInToTill(page, email);
    await page.goto("/pos");
    await page.getByLabel("Cash in the drawer").fill("200");
    await page.getByRole("button", { name: /^Open the till with/ }).click();

    const tiles = page.getByRole("main").getByRole("listitem").getByRole("button");
    await expect(tiles.first()).toBeVisible();

    // A five figure total is the widest the Charge button gets.
    const dearest = tiles.filter({ hasText: "Ensure Original" }).first();
    for (let tap = 0; tap < 13; tap++) await dearest.click();
    for (let tile = 0; tile < 8; tile++) await tiles.nth(tile).click();

    const sale = page.getByRole("region", { name: "Current sale" });
    for (const screen of SCREENS) {
      await page.setViewportSize({ width: screen.width, height: screen.height });
      await expect(sale).toBeVisible();
      await assertNothingSpills(page, screen.name);

      const charge = sale.getByRole("button", { name: /^Charge/ });
      await expect(charge).toBeInViewport({ ratio: 1 });
      await expect(sale.getByRole("button", { name: "Put this sale on hold" })).toBeInViewport({ ratio: 1 });
      await expect(page.getByRole("searchbox", { name: "Search products or scan a barcode" })).toBeInViewport({ ratio: 1 });
      expect(await tilesInView(page), `products in view on ${screen.name}`).toBeGreaterThanOrEqual(MIN_TILES_IN_VIEW);

      const lines = await sale.getByRole("listitem").evaluateAll((items) => items.map((item) => item.getBoundingClientRect().height));
      expect(Math.max(...lines), `sale line height on ${screen.name}`).toBeLessThanOrEqual(72);
    }

    await page.setViewportSize(PHONE);
    await assertNothingSpills(page, "a phone");
    await expect(page.getByRole("button", { name: "View sale" })).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole("button", { name: /^Charge/ })).toBeInViewport({ ratio: 1 });
    expect(await tilesInView(page), "products in view on a phone").toBeGreaterThanOrEqual(MIN_TILES_IN_VIEW);
  });
});
