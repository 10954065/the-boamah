import { expect, test, type Page } from "@playwright/test";

async function addProduct(page: Page, slug: string) {
  await page.goto(`/products/${slug}`);
  await page.getByRole("button", { name: /^Add to cart$/ }).click();
  await expect(page.getByText(/added to your cart/i)).toBeVisible();
}

test.describe("cart and checkout", () => {
  test("cart quantities, removal and totals", async ({ page }) => {
    await addProduct(page, "jasmine-rice");
    await page.goto("/cart");
    await expect(page.getByText("Jasmine Rice")).toBeVisible();
    await page.getByRole("button", { name: "Increase quantity" }).first().click();
    await expect(page.getByText("GH₵220.00").first()).toBeVisible(); // 2 × GH₵110 sale price
    await page.getByRole("button", { name: /Remove Jasmine Rice from cart/ }).click();
    await expect(page.getByRole("heading", { name: "Your cart is empty" })).toBeVisible();
  });

  test("invalid checkout details are rejected with clear messages", async ({ page }) => {
    await addProduct(page, "vegetable-oil");
    await addProduct(page, "jasmine-rice");
    await page.goto("/checkout", { waitUntil: "networkidle" });
    await page.locator("#zoneId").selectOption({ index: 1 });
    await page.getByLabel("Phone number").fill("12345");
    await page.getByRole("radio", { name: /Cash on delivery/ }).check();
    await expect(page.getByText("Total to pay")).toBeVisible();
    await page.getByRole("button", { name: "Place order" }).click();
    await expect(page.getByText("Enter your full name.")).toBeVisible();
    await expect(page.getByText(/valid Ghana phone number/)).toBeVisible();
  });

  test("guest can place a cash-on-delivery order with server-calculated totals", async ({ page }) => {
    await addProduct(page, "vegetable-oil");
    await addProduct(page, "jasmine-rice");
    await page.goto("/checkout", { waitUntil: "networkidle" });
    await page.getByLabel("Full name").fill("E2E Shopper");
    await page.getByRole("textbox", { name: "Email address", exact: true }).fill("e2e@example.com");
    await page.getByLabel("Phone number").fill("0241112222");
    await page.locator("#zoneId").selectOption({ index: 1 });
    await page.getByLabel("Town / city").fill("Accra");
    await page.getByLabel("Area / neighbourhood").fill("Osu");
    await page.getByLabel("Street address or landmark").fill("10 Test Road");
    await page.getByRole("radio", { name: /Cash on delivery/ }).check();
    await expect(page.getByText("Total to pay")).toBeVisible();
    await page.getByRole("button", { name: "Place order" }).click();
    await page.waitForURL(/\/orders\/BMH-/);
    await expect(page.getByText("Thank you — your order has been received")).toBeVisible();
    await expect(page.getByText("Pay on delivery").first()).toBeVisible();
  });

  test("online payment is only confirmed after server-side verification", async ({ page }) => {
    await addProduct(page, "vegetable-oil");
    await addProduct(page, "eggs");
    await page.goto("/checkout", { waitUntil: "networkidle" });
    await page.getByLabel("Full name").fill("E2E Payer");
    await page.getByRole("textbox", { name: "Email address", exact: true }).fill("payer@example.com");
    await page.getByLabel("Phone number").fill("0203334444");
    await page.locator("#zoneId").selectOption({ index: 1 });
    await page.getByLabel("Town / city").fill("Accra");
    await page.getByLabel("Area / neighbourhood").fill("Osu");
    await page.getByLabel("Street address or landmark").fill("11 Test Road");
    await page.getByRole("radio", { name: /Pay online/ }).check();
    await page.getByRole("button", { name: /Continue to secure payment/ }).click();
    await page.waitForURL(/\/dev\/mock-pay/);
    await page.getByRole("button", { name: "Simulate failed payment" }).click();
    await page.waitForURL(/payment=failed/);
    await expect(page.getByText("Your payment was not completed")).toBeVisible();
    await expect(page.getByRole("button", { name: "Pay now" })).toBeVisible();

    await page.getByRole("button", { name: "Pay now" }).click();
    await page.waitForURL(/\/dev\/mock-pay/);
    await page.getByRole("button", { name: "Simulate successful payment" }).click();
    await page.waitForURL(/placed=1/);
    await expect(page.getByText("Paid").first()).toBeVisible();
  });
});
