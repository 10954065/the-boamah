import { expect, test } from "@playwright/test";

test.describe("access control", () => {
  test("guests are sent to sign in for the admin and account areas", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin/);
    await page.goto("/account/orders");
    await expect(page).toHaveURL(/\/login\?next=/);
  });

  test("a signed-in customer cannot open the admin dashboard or other people's orders", async ({ page }) => {
    const email = `e2e.${Date.now()}@example.com`;
    await page.goto("/register");
    await page.getByLabel("Full name").fill("E2E Customer");
    await page.getByRole("textbox", { name: "Email address", exact: true }).fill(email);
    await page.locator("#password").fill("e2e-password-123");
    await page.locator("#confirmPassword").fill("e2e-password-123");
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL(/\/account$/);

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1 })).not.toHaveText("Dashboard");

    const response = await page.goto("/account/orders/BMH-000000-AAAAAA");
    expect(response?.status()).toBe(404);
  });

  test("admin server endpoints are not reachable without a session", async ({ request }) => {
    const res = await request.get("/api/cron/expire-orders");
    expect(res.status()).toBe(401);
    const webhook = await request.post("/api/payments/paystack/webhook", { data: { event: "charge.success" } });
    expect(webhook.status()).toBe(401);
  });
});
