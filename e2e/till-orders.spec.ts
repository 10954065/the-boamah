import { expect, test, type Page } from "@playwright/test";
import { db } from "./db";
import { createStaff, signInToTill } from "./staff";

const PRODUCT_SLUG = "welchs-fruit-snacks";

async function placeWebsiteOrder(page: Page, email: string): Promise<string> {
  await page.goto(`/products/${PRODUCT_SLUG}`);
  await page.getByRole("button", { name: /^Add to cart$/ }).click();
  await expect(page.getByText(/added to your cart/i)).toBeVisible();
  await page.goto("/checkout");
  await page.getByLabel("Full name").fill("Akua Website");
  await page.getByRole("textbox", { name: "Email address", exact: true }).fill(email);
  await page.getByLabel("Phone number").fill("0241112233");
  await page.locator("#zoneId").selectOption({ index: 1 });
  await page.getByLabel("Town / city").fill("Accra");
  await page.getByLabel("Area / neighbourhood").fill("Osu");
  await page.getByLabel("Street address or landmark").fill("10 Packing Road");
  await page.getByRole("radio", { name: /Cash on delivery/ }).check();
  await page.getByRole("button", { name: "Place order" }).click();
  await page.waitForURL(/\/orders\/BMH-/);
  return /\/orders\/(BMH-[^/?]+)/.exec(page.url())![1]!;
}

test.describe("website orders on the till", () => {
  const stamp = Date.now();
  const cashierEmail = `till.orders.e2e.${stamp}@example.com`;
  const shopperEmail = `shopper.orders.e2e.${stamp}@example.com`;
  let cashierId = "";
  let stockBefore = 0;
  let variantId = "";

  test.beforeAll(async () => {
    await db.posShift.updateMany({ where: { closedAt: null, till: { code: "T1" } }, data: { closedAt: new Date(), notes: "Closed by the e2e run" } });
    cashierId = await createStaff("Yaa Packer", cashierEmail);
    const variant = await db.productVariant.findFirstOrThrow({ where: { isActive: true, product: { slug: PRODUCT_SLUG } } });
    variantId = variant.id;
    stockBefore = variant.stockMilli;
  });

  test.afterAll(async () => {
    const orders = await db.order.findMany({ where: { email: shopperEmail }, select: { id: true } });
    const ids = orders.map((order) => order.id);
    await db.inventoryMovement.deleteMany({ where: { orderId: { in: ids } } });
    await db.notification.deleteMany({ where: { orderId: { in: ids } } });
    await db.order.deleteMany({ where: { id: { in: ids } } });
    await db.productVariant.update({ where: { id: variantId }, data: { stockMilli: stockBefore } });
    await db.posShift.deleteMany({ where: { cashierId } });
    await db.auditLog.deleteMany({ where: { actorId: cashierId } });
    await db.user.delete({ where: { id: cashierId } });
  });

  test("an order placed on the website lands on the till by itself, is packed and goes to the rider", async ({ page, browser }) => {
    test.setTimeout(120_000);

    // The cashier is already at the till when the order comes in.
    await signInToTill(page, cashierEmail);
    await page.goto("/pos");
    await page.getByLabel("Cash in the drawer").fill("100");
    await page.getByRole("button", { name: /^Open the till with/ }).click();
    const websiteOrders = page.getByRole("button", { name: /^Website orders/ });
    await expect(websiteOrders).toBeVisible();
    await websiteOrders.click();

    const shopper = await browser.newContext();
    const shop = await shopper.newPage();
    const reference = await placeWebsiteOrder(shop, shopperEmail);

    // No refresh: it turns up, marked as a website order, with what to collect.
    const card = page.getByRole("main").getByRole("button", { name: new RegExp(reference) });
    await expect(card).toBeVisible({ timeout: 25_000 });
    await expect(card).toContainText("Website");
    await expect(card).toContainText("Akua Website");
    await expect(card).toContainText("Customer pays");
    await expect(page.getByRole("region", { name: "To pack" }).getByRole("button", { name: new RegExp(reference) })).toBeVisible();

    // The pick list says who it is for, where it goes and what goes in the bag.
    await card.click();
    const sheet = page.getByRole("dialog", { name: `Website order ${reference}` });
    await expect(sheet.getByText("Akua Website")).toBeVisible();
    await expect(sheet.getByText("0241112233")).toBeVisible();
    await expect(sheet.getByText("10 Packing Road")).toBeVisible();
    await expect(sheet.getByText("Welch's Fruit Snacks")).toBeVisible();
    await expect(sheet.locator("img").first()).toBeVisible();

    const progress = sheet.getByRole("list", { name: "Order progress" });
    await expect(progress.locator('[aria-current="step"]')).toHaveText(/Placed/);
    await sheet.getByRole("button", { name: "Start packing" }).click();
    await expect(sheet.getByText("Being prepared")).toBeVisible();
    await expect(progress.locator('[aria-current="step"]')).toHaveText(/Packing/);

    // Nothing is marked packed until every item is ticked off.
    const packed = sheet.getByRole("button", { name: "Packed, ready for the rider" });
    await expect(packed).toBeDisabled();
    for (const box of await sheet.getByRole("checkbox").all()) await box.check();
    await expect(packed).toBeEnabled();

    // The slip prints the order and nothing else, marked as a website order.
    await page.emulateMedia({ media: "print" });
    const slip = page.locator(".pos-print");
    await expect(slip).toBeVisible();
    await expect(slip).toContainText("WEBSITE ORDER");
    await expect(slip).toContainText(reference);
    await expect(slip).toContainText("Welch's Fruit Snacks");
    await page.emulateMedia({ media: "screen" });

    await packed.click();
    await sheet.getByRole("button", { name: "Given to the rider" }).click();
    await expect(progress.locator('[aria-current="step"]')).toHaveText(/With the rider/);

    // The customer sees it on its way; the till keeps it until the rider is back.
    await shop.reload();
    await expect(shop.getByText("Out for delivery").first()).toBeVisible();
    await sheet.getByRole("button", { name: "Delivered to the customer" }).click();
    await expect(sheet).toBeHidden();
    await expect(card).toBeHidden();

    // The order's history shows who did each step.
    const saved = await db.order.findUniqueOrThrow({ where: { reference }, include: { statusHistory: { orderBy: { createdAt: "asc" } } } });
    expect(saved.status).toBe("DELIVERED");
    expect(saved.statusHistory.slice(1).map((step) => step.actorId)).toEqual([cashierId, cashierId, cashierId, cashierId]);
    await shopper.close();
  });

  test("the till's order list is closed to anyone not signed in", async ({ request }) => {
    const list = await request.get("/api/pos/orders");
    expect(list.status()).toBe(401);
  });
});
