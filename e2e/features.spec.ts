import { expect, test, type Page } from "@playwright/test";
import { db, setStock } from "./db";

async function register(page: Page): Promise<string> {
  const email = `e2e.${Date.now()}@example.com`;
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Ama Boateng");
  await page.getByRole("textbox", { name: "Email address", exact: true }).fill(email);
  await page.locator("#password").fill("e2e-password-123");
  await page.locator("#confirmPassword").fill("e2e-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/account$/);
  return email;
}

async function placeCashOrder(page: Page): Promise<string> {
  await page.goto("/products/royal-basmati-rice");
  await page.getByRole("button", { name: /^Add to cart$/ }).click();
  await expect(page.getByText(/added to your cart/i)).toBeVisible();
  await page.goto("/checkout");
  await page.getByLabel("Full name").fill("Ama Boateng");
  await page.getByLabel("Phone number").fill("0241112222");
  await page.locator("#zoneId").selectOption({ index: 1 });
  await page.getByLabel("Town / city").fill("Accra");
  await page.getByLabel("Area / neighbourhood").fill("Osu");
  await page.getByLabel("Street address or landmark").fill("10 Test Road");
  await page.getByRole("radio", { name: /Cash on delivery/ }).check();
  await expect(page.getByText("Total to pay")).toBeVisible();
  await page.getByRole("button", { name: "Place order" }).click();
  await page.waitForURL(/\/account\/orders\/BMH-/);
  return new URL(page.url()).pathname.split("/").at(-1)!;
}

test.describe("shopping features", () => {
  test("bulk prices show on the product page and apply in the cart", async ({ page }) => {
    await page.goto("/products/royal-basmati-rice");
    const bulk = page.getByRole("group", { name: "Buy more, pay less" });
    await expect(bulk).toContainText("5 bags or more");
    await expect(bulk).toContainText("Add 4 bags more to pay GH₵420.00 per bag.");
    await bulk.getByRole("button", { name: "Choose 5 bags" }).click();
    await expect(bulk).toContainText("Bulk price applied. You save GH₵150.00 on 5 bags.");

    await page.getByRole("button", { name: /^Add to cart$/ }).click();
    await expect(page.getByText(/added to your cart/i)).toBeVisible();
    await page.goto("/cart");
    await expect(page.getByText("Bulk price", { exact: true })).toBeVisible();
    await expect(page.getByText("GH₵2,100.00").first()).toBeVisible(); // 5 × GH₵420
  });

  test("the WhatsApp button opens a chat about the product being viewed", async ({ page }) => {
    const settings = await db.storeSettings.findUnique({ where: { id: "default" }, select: { whatsappNumber: true } });
    await db.storeSettings.update({ where: { id: "default" }, data: { whatsappNumber: "024 123 4567" } });
    try {
      await page.goto("/");
      const chat = page.getByRole("link", { name: /Chat with us on WhatsApp/ });
      await expect(chat).toHaveAttribute("href", /^https:\/\/wa\.me\/233241234567\?text=Hi%2C%20I%20have%20a%20question/);

      await page.goto("/products/quaker-quick-oats");
      await expect(page.getByRole("link", { name: /Chat with us on WhatsApp/ })).toHaveCount(1);
      await expect(page.getByRole("link", { name: /Chat with us on WhatsApp/ })).toHaveAttribute("href", /about%20Quaker%20Quick%201-Minute%20Oats/);
    } finally {
      await db.storeSettings.update({ where: { id: "default" }, data: { whatsappNumber: settings?.whatsappNumber ?? null } });
    }
  });

  test("shoppers can ask to be told when an out-of-stock product is back", async ({ page }) => {
    const email = `e2e.alert.${Date.now()}@example.com`;
    await setStock("famous-amos-cookies", 0);
    try {
      await page.goto("/products/famous-amos-cookies");
      await page.getByLabel("Tell me when it’s back").fill(email);
      await page.getByRole("button", { name: /Notify me when/ }).click();
      await expect(page.getByText("Thanks. We will email you as soon as it is back.")).toBeVisible();
      expect(await db.stockAlert.count({ where: { contact: email, notifiedAt: null } })).toBe(1);
    } finally {
      await db.stockAlert.deleteMany({ where: { contact: email } });
      await setStock("famous-amos-cookies", 12_000);
    }
  });

  test("a customer can buy a past order again and review what was delivered", async ({ page }) => {
    const email = await register(page);
    const reference = await placeCashOrder(page);

    // Before delivery, reviews are not open to this customer.
    await page.goto("/products/royal-basmati-rice");
    await expect(page.getByText(/Only customers who have received this product can review it/)).toBeVisible();

    await page.goto("/account/orders");
    await page.getByRole("button", { name: `Buy again: order ${reference}` }).click();
    await page.waitForURL(/\/cart$/);
    await expect(page.getByRole("link", { name: "Royal Basmati Rice" }).first()).toBeVisible();

    await db.order.update({ where: { reference }, data: { status: "DELIVERED", deliveredAt: new Date() } });
    try {
      await page.goto("/products/royal-basmati-rice#reviews");
      const reviews = page.getByRole("region", { name: "Customer reviews" });
      await reviews.locator("label").filter({ has: page.getByRole("radio", { name: "5 stars, Excellent" }) }).click();
      await expect(reviews.getByRole("radio", { name: "5 stars, Excellent" })).toBeChecked();
      await reviews.getByLabel("Your review").fill("Lovely long grains, cooks well for jollof.");
      await reviews.getByRole("button", { name: "Submit review" }).click();
      await expect(reviews.getByText(/It will appear once our team has checked it/)).toBeVisible();

      // Pending reviews stay hidden until a staff member approves them.
      await page.reload();
      await expect(page.getByText("Lovely long grains, cooks well for jollof.")).toHaveCount(0);

      await db.review.updateMany({ where: { user: { email } }, data: { status: "APPROVED", moderatedAt: new Date() } });
      await page.reload();
      await expect(page.getByRole("region", { name: "Customer reviews" }).getByText("Lovely long grains, cooks well for jollof.")).toBeVisible();
      await expect(page.getByText("Ama B.").first()).toBeVisible();
      const jsonLd = await page.locator('script[type="application/ld+json"]').first().textContent();
      expect(jsonLd).toContain('"aggregateRating"');
    } finally {
      await db.review.deleteMany({ where: { user: { email } } });
    }
  });
});
