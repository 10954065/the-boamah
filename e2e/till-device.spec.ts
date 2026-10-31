import { expect, test, type Page } from "@playwright/test";
import { db } from "./db";
import { asNewVisitor, createStaff, PASSWORD, tillLink } from "./staff";

// Radix hides the page from the accessibility tree behind an open dialog, so keys are found by their label in the markup.
const keyboard = (page: Page) => page.locator("[data-onscreen-keyboard]");
const LETTERS_AND_DIGITS = /^[a-z0-9.@ ]$/;

/** Types with the on-screen keys only, switching to the symbols for anything else. */
async function tapOut(page: Page, text: string): Promise<void> {
  const keys = keyboard(page);
  for (const char of text) {
    const label = char === " " ? "Space" : char;
    if (LETTERS_AND_DIGITS.test(char)) {
      await keys.locator(`button[aria-label="${label}"]`).click();
      continue;
    }
    await keys.locator('button[aria-label="Symbols"]').click();
    await keys.locator(`button[aria-label="${label}"]`).click();
    await keys.locator('button[aria-label="Letters"]').click();
  }
}

test.describe("till on a touch screen with no keyboard", () => {
  const stamp = Date.now();
  const email = `till.device.e2e.${stamp}@example.com`;
  let cashierId = "";
  let productWord = "";

  test.beforeAll(async () => {
    const variant = await db.productVariant.findFirstOrThrow({
      where: { isActive: true, unit: { not: "KG" }, stockMilli: { gte: 5000 }, product: { status: "PUBLISHED" } },
      include: { product: { select: { name: true } } },
    });
    productWord = variant.product.name.toLowerCase().replace(/[^a-z]/g, " ").trim().split(/\s+/)[0]!.slice(0, 5);
    // A shift left open on the till by an earlier run would stand in the way.
    await db.posShift.updateMany({ where: { closedAt: null, till: { code: "T1" } }, data: { closedAt: new Date(), notes: "Closed by the e2e run" } });
    cashierId = await createStaff("Abena Touch", email);
  });

  test.afterAll(async () => {
    await db.posShift.deleteMany({ where: { cashierId } });
    await db.auditLog.deleteMany({ where: { actorId: cashierId } });
    await db.user.delete({ where: { id: cashierId } });
  });

  test("a cashier signs in, searches and holds a sale with the on-screen keyboard, and the till fills the screen", async ({ page }) => {
    await asNewVisitor(page);
    await page.goto(tillLink);
    await expect(page).toHaveURL(/\/pos\/login/);

    // Switched on once for the device; nothing shows until a field is tapped.
    await page.getByRole("button", { name: "On-screen keyboard" }).click();
    await expect(page.getByRole("button", { name: "On-screen keyboard" })).toHaveAttribute("aria-pressed", "true");
    await expect(keyboard(page)).toHaveCount(0);

    await page.getByLabel("Email address").click();
    await expect(keyboard(page)).toBeVisible();
    await tapOut(page, email);
    await expect(page.getByLabel("Email address")).toHaveValue(email);
    await page.getByLabel("Password", { exact: true }).click();
    await tapOut(page, PASSWORD);
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue(PASSWORD);
    await keyboard(page).locator('button[aria-label="Enter"]').click();
    await page.waitForURL(/\/pos$/);

    // The opening float has the till's own number keys, so the keyboard stays away.
    await page.getByLabel("Cash in the drawer").click();
    await expect(keyboard(page)).toHaveCount(0);
    await page.getByLabel("Cash in the drawer").fill("50");
    await page.getByRole("button", { name: /^Open the till with/ }).click();

    // The search box gets the cursor by itself after every sale; only a tap brings the keyboard up.
    const search = page.getByRole("searchbox", { name: "Search products or scan a barcode" });
    await expect(search).toBeFocused();
    await expect(keyboard(page)).toHaveCount(0);
    await search.click();
    await tapOut(page, productWord);
    await expect(search).toHaveValue(productWord);
    await page.locator('section[aria-labelledby="till-results-title"] li').first().click();
    await expect(keyboard(page)).toHaveCount(0);

    // A dialog that opens with the cursor in a field brings the keyboard, and tapping keys does not close it.
    const sale = page.getByRole("region", { name: "Current sale" });
    await sale.getByRole("button", { name: "Put this sale on hold" }).click();
    const hold = page.getByRole("dialog", { name: "Put this sale on hold" });
    await expect(keyboard(page)).toBeVisible();
    await keyboard(page).locator('button[aria-label="Shift"]').click();
    await keyboard(page).locator('button[aria-label="A"]').click();
    // Shift is for one letter only.
    await tapOut(page, "ma");
    await expect(hold.getByLabel(/Who is it for/)).toHaveValue("Ama");
    const dialogBottom = await hold.evaluate((box) => box.getBoundingClientRect().bottom);
    const keyboardTop = await keyboard(page).evaluate((box) => box.getBoundingClientRect().top);
    expect(dialogBottom, "the dialog sits above the keyboard").toBeLessThanOrEqual(keyboardTop);
    await keyboard(page).locator('button[aria-label="Enter"]').click();
    await expect(hold).toBeHidden();
    await expect(page.getByRole("button", { name: "On hold (1)" })).toBeVisible();

    // Full screen from the menu, and back.
    const fullScreen = page.getByRole("button", { name: "Full screen" });
    await fullScreen.click();
    await expect(fullScreen).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
    await fullScreen.click();
    await expect(fullScreen).toHaveAttribute("aria-pressed", "false");
  });
});
