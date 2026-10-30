import { expect, test, type Page } from "@playwright/test";
import { formatMoney, minorToDecimalString } from "../src/lib/money";
import { db } from "./db";

const PASSWORD = "e2e-password-123";

/** Registers a shop account and gives it a staff role (Cashier unless said otherwise). */
async function signUpCashier(page: Page, name: string, email: string, role: "CASHIER" | "STORE_MANAGER" = "CASHIER"): Promise<string> {
  await page.goto("/register");
  await page.getByLabel("Full name").fill(name);
  await page.getByRole("textbox", { name: "Email address", exact: true }).fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.locator("#confirmPassword").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/account$/);
  const user = await db.user.update({ where: { email }, data: { role } });
  return user.id;
}

/**
 * Whether the till's offline helper is running (only in production builds).
 * When it is, the till page must get saved on the device, and stay saved.
 */
async function offlineHelperReady(page: Page): Promise<boolean> {
  const state = await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) return "no helper";
    const ready = await Promise.race([navigator.serviceWorker.ready.then(() => true), new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5000))]);
    if (!ready) return "no helper";
    for (let tries = 0; tries < 50; tries++) {
      if (await caches.match("/pos")) return "saved";
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return "not saved";
  });
  expect(state, "the till page is saved for offline use").not.toBe("not saved");
  if (state === "no helper") return false;
  // Still there a moment later: nothing removes it while the cashier is signed in.
  await page.waitForTimeout(2000);
  expect(await page.evaluate(async () => Boolean(await caches.match("/pos")))).toBe(true);
  return true;
}

/**
 * The in-shop till end to end on the seeded database: shift, barcode sale,
 * cash with change, mobile money, receipt printing and closing the count, and
 * selling with no internet. Locally the till is served at /pos on the shop's
 * own address.
 */
test.describe("in-shop till", () => {
  const stamp = Date.now();
  const email = `till.e2e.${stamp}@example.com`;
  const offlineEmail = `till.offline.e2e.${stamp}@example.com`;
  const returnsEmail = `till.returns.e2e.${stamp}@example.com`;
  const managerEmail = `till.manager.e2e.${stamp}@example.com`;
  const barcode = `E2E${stamp}`;
  let product = { variantId: "", name: "", priceMinor: 0, stockMilli: 0, barcode: null as string | null };

  test.beforeAll(async () => {
    const variant = await db.productVariant.findFirstOrThrow({
      where: { isActive: true, unit: { not: "KG" }, stockMilli: { gte: 5000 }, salePriceMinor: null, priceTiers: { none: {} }, product: { status: "PUBLISHED" } },
      include: { product: { select: { name: true } } },
    });
    product = { variantId: variant.id, name: variant.product.name, priceMinor: variant.priceMinor, stockMilli: variant.stockMilli, barcode: variant.barcode };
    await db.productVariant.update({ where: { id: variant.id }, data: { barcode } });
    // A shift left open on the till by an earlier run would stand in the way.
    await db.posShift.updateMany({ where: { closedAt: null, till: { code: "T1" } }, data: { closedAt: new Date(), notes: "Closed by the e2e run" } });
  });

  test.afterAll(async () => {
    for (const address of [email, offlineEmail, returnsEmail, managerEmail]) {
      const user = await db.user.findUnique({ where: { email: address } });
      if (!user) continue;
      const sales = await db.posSale.findMany({ where: { cashierId: user.id }, select: { id: true } });
      const saleIds = sales.map((s) => s.id);
      const returns = await db.posReturn.findMany({ where: { OR: [{ saleId: { in: saleIds } }, { cashierId: user.id }, { approvedById: user.id }] }, select: { id: true } });
      await db.inventoryMovement.deleteMany({ where: { OR: [{ posSaleId: { in: saleIds } }, { posReturnId: { in: returns.map((r) => r.id) } }] } });
      await db.posReturn.deleteMany({ where: { id: { in: returns.map((r) => r.id) } } });
      await db.auditLog.deleteMany({ where: { actorId: user.id } });
      await db.rateLimit.deleteMany({ where: { key: { startsWith: "app:pos-approval" }, OR: [{ key: { endsWith: user.id } }, { key: { endsWith: address } }] } });
      await db.posSale.deleteMany({ where: { cashierId: user.id } });
      await db.posShift.deleteMany({ where: { cashierId: user.id } });
      await db.user.delete({ where: { id: user.id } });
    }
    if (product.variantId) await db.productVariant.update({ where: { id: product.variantId }, data: { barcode: product.barcode, stockMilli: product.stockMilli } });
  });

  test("a cashier opens a shift, sells by barcode, takes cash and mobile money, prints and closes the shift", async ({ page }) => {
    await signUpCashier(page, "Ama Till", email);

    // Open the shift with a GH₵200 float.
    await page.goto("/pos");
    await expect(page.getByRole("heading", { name: "Start your shift" })).toBeVisible();
    await page.getByLabel("Cash in the drawer").fill("200");
    await page.getByRole("button", { name: `Open the till with ${formatMoney(20_000)}` }).click();

    // Once the products have loaded, scan the barcode, then add one more.
    const search = page.getByRole("searchbox", { name: "Search products or scan a barcode" });
    await expect(search).toBeFocused();
    await expect(page.getByRole("main").getByRole("listitem").first()).toBeVisible();
    await search.fill(barcode);
    await search.press("Enter");
    const sale = page.getByRole("region", { name: "Current sale" });
    await expect(sale.getByText(product.name)).toBeVisible();
    await sale.getByRole("button", { name: `One more ${product.name}` }).click();
    const total = product.priceMinor * 2;
    const chargeButton = sale.getByRole("button", { name: /^Charge/ });
    await expect(chargeButton).toContainText(formatMoney(total));

    // Cash over the total gives change.
    await chargeButton.click();
    const pay = page.getByRole("dialog", { name: "Take payment" });
    await pay.getByLabel("Cash received").fill(minorToDecimalString(total + 5000));
    await expect(pay.getByText("Change to give")).toBeVisible();
    await pay.getByRole("button", { name: "Complete sale" }).click();

    const done = page.getByRole("dialog", { name: "Sale complete" });
    await expect(done).toBeVisible();
    const firstNumber = (await done.getByText(/^Receipt T1-\d{6}$/).first().textContent())!.replace("Receipt ", "");
    await expect(done.getByText(formatMoney(5000)).first()).toBeVisible();

    // Printing shows the receipt and nothing else.
    await page.emulateMedia({ media: "print" });
    await expect(page.locator(".pos-print")).toBeVisible();
    await expect(page.locator(".pos-print")).toContainText(firstNumber);
    await expect(page.locator(".pos-print")).toContainText("Total");
    await expect(page.locator(".pos-print")).toContainText("System built by Sunleon Router Enterprise");
    await expect(search).toBeHidden();
    await page.emulateMedia({ media: "screen" });

    const recorded = await db.posSale.findUniqueOrThrow({ where: { receiptNumber: firstNumber }, include: { payments: true, shift: true } });
    expect(recorded).toMatchObject({ totalMinor: total, changeMinor: 5000, hasShortfall: false, hasPriceDifference: false });
    expect(recorded.shift?.openingFloatMinor).toBe(20_000);
    expect((await db.productVariant.findUniqueOrThrow({ where: { id: product.variantId } })).stockMilli).toBe(product.stockMilli - 2000);

    // Second sale by mobile money, which needs the transaction ID. F4 takes payment.
    await done.getByRole("button", { name: "New sale" }).click();
    await search.fill(barcode);
    await search.press("Enter");
    await page.keyboard.press("F4");
    await pay.getByRole("button", { name: "Mobile money" }).click();
    await pay.getByRole("button", { name: "Complete sale" }).click();
    await expect(pay.getByRole("alert")).toContainText("transaction ID");
    await pay.getByLabel("Transaction ID").fill("MP2611021230");
    await pay.getByRole("button", { name: "Complete sale" }).click();
    const secondNumber = (await done.getByText(/^Receipt T1-\d{6}$/).first().textContent())!.replace("Receipt ", "");
    expect(Number(secondNumber.slice(3))).toBe(Number(firstNumber.slice(3)) + 1);
    await done.getByRole("button", { name: "New sale" }).click();

    // Close the shift: the count matches what the sales took.
    await page.getByRole("button", { name: "Close shift" }).click();
    const close = page.getByRole("dialog", { name: "Close the shift" });
    await close.getByLabel("Cash in the drawer").fill(minorToDecimalString(20_000 + total));
    await close.getByLabel("Mobile money received").fill(minorToDecimalString(product.priceMinor));
    await close.getByRole("button", { name: "Close the shift" }).click();
    const report = page.getByRole("dialog", { name: "Shift closed" });
    await expect(report.getByText("2 sales for")).toBeVisible();
    for (const method of ["Cash", "Mobile money", "Card"]) {
      await expect(report.getByRole("row", { name: new RegExp(`^${method}`) })).toContainText("Exact");
    }
    await report.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("heading", { name: "Start your shift" })).toBeVisible();
  });

  test("the till keeps selling with no internet and sends everything once the connection is back", async ({ page, context }) => {
    const cashierId = await signUpCashier(page, "Kofi Offline", offlineEmail);
    await page.goto("/pos");
    await page.getByLabel("Cash in the drawer").fill("100");
    await page.getByRole("button", { name: `Open the till with ${formatMoney(10_000)}` }).click();
    const search = page.getByRole("searchbox", { name: "Search products or scan a barcode" });
    await expect(page.getByRole("main").getByRole("listitem").first()).toBeVisible();
    // Production builds keep the till on the device, so it can even be reloaded offline.
    const savedOnDevice = await offlineHelperReady(page);
    test.info().annotations.push({ type: "offline reload", description: savedOnDevice ? "tested" : "skipped: no offline helper (development server)" });

    async function sellOneOffline(): Promise<string> {
      await search.fill(barcode);
      await search.press("Enter");
      await page.getByRole("region", { name: "Current sale" }).getByRole("button", { name: /^Charge/ }).click();
      const pay = page.getByRole("dialog", { name: "Take payment" });
      await pay.getByLabel("Cash received").fill(minorToDecimalString(product.priceMinor));
      await pay.getByRole("button", { name: "Complete sale" }).click();
      const done = page.getByRole("dialog", { name: "Sale complete" });
      await expect(done.getByText("Saved on this till.")).toBeVisible();
      const number = (await done.getByText(/^Receipt T1-\d{6}$/).first().textContent())!.replace("Receipt ", "");
      await done.getByRole("button", { name: "New sale" }).click();
      return number;
    }

    await context.setOffline(true);
    await expect(page.getByText(/^No internet connection\./)).toBeVisible();
    const numbers = [await sellOneOffline()];
    expect(await db.posSale.findUnique({ where: { receiptNumber: numbers[0] } })).toBeNull();
    await expect(page.getByRole("button", { name: "1 to send" })).toBeVisible();

    if (savedOnDevice) {
      // Reloaded with no connection: the same shift, the products saved on the till, and the sale still waiting.
      await page.reload();
      await expect(search).toBeVisible();
      await expect(page.getByRole("main").getByRole("listitem").first()).toBeVisible();
      await expect(page.getByRole("button", { name: "1 to send" })).toBeVisible();
      numbers.push(await sellOneOffline());
      await expect(page.getByRole("button", { name: "2 to send" })).toBeVisible();
    }

    // Closing offline gives a report worked out from the sales on this till.
    await page.getByRole("button", { name: "Close shift" }).click();
    const close = page.getByRole("dialog", { name: "Close the shift" });
    await close.getByLabel("Cash in the drawer").fill(minorToDecimalString(10_000 + product.priceMinor * numbers.length));
    await close.getByRole("button", { name: "Close the shift" }).click();
    const report = page.getByRole("dialog", { name: "Shift closed" });
    await expect(report.getByText(/^Worked out on this till/)).toBeVisible();
    await expect(report.getByText(`${numbers.length} ${numbers.length === 1 ? "sale" : "sales"} for`)).toBeVisible();
    await expect(report.getByRole("row", { name: /^Cash/ })).toContainText("Exact");
    await report.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("heading", { name: "Start your shift" })).toBeVisible();
    await expect(page.getByRole("button", { name: `${numbers.length + 1} to send` })).toBeVisible();

    // Back online: the sales and the close go by themselves, in order.
    await context.setOffline(false);
    await expect(page.getByRole("button", { name: /to send$/ })).toBeHidden({ timeout: 20_000 });
    const recorded = await db.posSale.findMany({ where: { cashierId }, orderBy: { receiptNumber: "asc" }, include: { shift: true } });
    expect(recorded.map((sale) => sale.receiptNumber)).toEqual(numbers);
    expect(recorded.every((sale) => sale.shift?.closedAt !== null && sale.shift?.openingFloatMinor === 10_000)).toBe(true);
    expect(recorded[0]?.shift?.countedCashMinor).toBe(10_000 + product.priceMinor * numbers.length);
  });

  test("a sale is held and picked up again, and a manager approves a return and a void", async ({ page, browser }) => {
    // A manager with their own account, who will approve on the cashier's till.
    const managerContext = await browser.newContext();
    await signUpCashier(await managerContext.newPage(), "Kwame Manager", managerEmail, "STORE_MANAGER");
    await managerContext.close();

    const cashierId = await signUpCashier(page, "Efua Returns", returnsEmail);
    await page.goto("/pos");
    await page.getByLabel("Cash in the drawer").fill("100");
    await page.getByRole("button", { name: `Open the till with ${formatMoney(10_000)}` }).click();
    const search = page.getByRole("searchbox", { name: "Search products or scan a barcode" });
    await expect(page.getByRole("main").getByRole("listitem").first()).toBeVisible();
    const stockBefore = (await db.productVariant.findUniqueOrThrow({ where: { id: product.variantId } })).stockMilli;
    const sale = page.getByRole("region", { name: "Current sale" });

    // Two on hold while someone else is served, then picked up again.
    await search.fill(barcode);
    await search.press("Enter");
    await sale.getByRole("button", { name: `One more ${product.name}` }).click();
    await sale.getByRole("button", { name: "Put this sale on hold" }).click();
    const hold = page.getByRole("dialog", { name: "Put this sale on hold" });
    await hold.getByLabel(/Who is it for/).fill("Blue bag");
    await hold.getByRole("button", { name: "Put on hold" }).click();
    await expect(sale.getByText("Scan a barcode or tap a product to start a sale.")).toBeVisible();
    await page.getByRole("button", { name: "On hold (1)" }).click();
    const held = page.getByRole("dialog", { name: "Sales on hold" });
    await expect(held.getByText("Blue bag")).toBeVisible();
    await held.getByRole("button", { name: "Pick up" }).click();
    await expect(sale.getByRole("button", { name: /^Charge/ })).toContainText(formatMoney(product.priceMinor * 2));

    async function sellForCash(totalMinor: number): Promise<string> {
      await sale.getByRole("button", { name: /^Charge/ }).click();
      const pay = page.getByRole("dialog", { name: "Take payment" });
      await pay.getByLabel("Cash received").fill(minorToDecimalString(totalMinor));
      await pay.getByRole("button", { name: "Complete sale" }).click();
      const done = page.getByRole("dialog", { name: "Sale complete" });
      const number = (await done.getByText(/^Receipt T1-\d{6}$/).first().textContent())!.replace("Receipt ", "");
      await done.getByRole("button", { name: "New sale" }).click();
      return number;
    }
    const kept = await sellForCash(product.priceMinor * 2);
    await search.fill(barcode);
    await search.press("Enter");
    const mistaken = await sellForCash(product.priceMinor);

    // One of the two comes back. A wrong manager password is refused; the right one approves.
    await page.getByRole("button", { name: "Sales" }).click();
    const sheet = page.getByRole("dialog", { name: "Sales this shift" });
    await sheet.getByRole("button", { name: new RegExp(kept) }).click();
    await sheet.getByRole("button", { name: "Return items" }).click();
    const returning = page.getByRole("dialog", { name: `Return items from ${kept}` });
    await returning.getByLabel(/comes back/).fill("1");
    await returning.getByRole("button", { name: "Wrong item" }).click();
    await returning.getByLabel("Manager's email").fill(managerEmail);
    await returning.getByLabel("Manager's password").fill("not-the-password");
    await returning.getByRole("button", { name: /^Refund GH/ }).click();
    await expect(returning.getByRole("alert")).toContainText("not right");
    await returning.getByLabel("Manager's password").fill(PASSWORD);
    await returning.getByRole("button", { name: /^Refund GH/ }).click();
    const slip = page.getByRole("dialog", { name: "Refund recorded" });
    await expect(slip.getByText(formatMoney(product.priceMinor)).first()).toBeVisible();
    await page.emulateMedia({ media: "print" });
    await expect(page.locator(".pos-print")).toContainText("Refund total");
    await expect(page.locator(".pos-print")).toContainText("System built by Sunleon Router Enterprise");
    await page.emulateMedia({ media: "screen" });
    await slip.getByRole("button", { name: "Done" }).click();

    // The other sale was a mistake: voided.
    await sheet.getByRole("button", { name: "All sales" }).click();
    await sheet.getByRole("button", { name: new RegExp(mistaken) }).click();
    await sheet.getByRole("button", { name: "Void sale" }).click();
    const voiding = page.getByRole("dialog", { name: `Void receipt ${mistaken}` });
    await voiding.getByRole("button", { name: "Rung up by mistake" }).click();
    await voiding.getByLabel("Manager's email").fill(managerEmail);
    await voiding.getByLabel("Manager's password").fill(PASSWORD);
    await voiding.getByRole("button", { name: /^Void the sale/ }).click();
    await expect(sheet.getByText(/^Voided at/)).toBeVisible();
    await page.keyboard.press("Escape");

    const sales = await db.posSale.findMany({ where: { cashierId }, include: { returns: true } });
    expect(sales.find((s) => s.receiptNumber === mistaken)?.status).toBe("VOIDED");
    expect(sales.find((s) => s.receiptNumber === kept)?.returns).toMatchObject([{ refundMinor: product.priceMinor, method: "CASH" }]);
    // Three sold, one back from the return and one from the void.
    expect((await db.productVariant.findUniqueOrThrow({ where: { id: product.variantId } })).stockMilli).toBe(stockBefore - 1000);

    // The count balances once the refund is taken off and the void is left out.
    await page.getByRole("button", { name: "Close shift" }).click();
    const close = page.getByRole("dialog", { name: "Close the shift" });
    await close.getByLabel("Cash in the drawer").fill(minorToDecimalString(10_000 + product.priceMinor));
    await close.getByRole("button", { name: "Close the shift" }).click();
    const report = page.getByRole("dialog", { name: "Shift closed" });
    await expect(report.getByText(/1 refund for/)).toBeVisible();
    await expect(report.getByText(/1 voided sale/)).toBeVisible();
    await expect(report.getByRole("row", { name: /^Cash/ })).toContainText("Exact");
    await report.getByRole("button", { name: "Done" }).click();
  });
});
