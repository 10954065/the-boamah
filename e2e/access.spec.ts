import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { db } from "./db";
import { adminLink, asNewVisitor, createStaff, fillSignIn, gateIsOn, PASSWORD, signInToAdmin, tillLink } from "./staff";

const NOT_FOUND = "We couldn't find that page";

test.describe("staff pages stay hidden", () => {
  test.skip(!gateIsOn, "The gate needs STAFF_GATE_KEY");

  const stamp = Date.now();
  const adminEmail = `gate.admin.${stamp}@example.com`;
  const lockedEmail = `gate.locked.${stamp}@example.com`;
  const customerEmail = `gate.customer.${stamp}@example.com`;
  const newStaffEmail = `gate.new.${stamp}@example.com`;
  const emails = [adminEmail, lockedEmail, customerEmail, newStaffEmail];

  test.beforeAll(async () => {
    await createStaff("Gate Admin", adminEmail, "SUPER_ADMIN");
    await createStaff("Gate Locked", lockedEmail, "STORE_MANAGER");
    await createStaff("Old Customer", customerEmail, "CUSTOMER");
  });

  test.afterAll(async () => {
    const users = await db.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
    await db.auditLog.deleteMany({ where: { OR: [{ actorId: { in: users.map((u) => u.id) } }, { action: "auth.sign_in.locked", details: { path: ["email"], equals: lockedEmail } }] } });
    await db.rateLimit.deleteMany({ where: { key: { startsWith: "app:sign-in-failed" }, OR: emails.map((email) => ({ key: { endsWith: email } })) } });
    await db.user.deleteMany({ where: { email: { in: emails } } });
  });

  test("every staff address looks like any missing page to a visitor", async ({ page }) => {
    for (const path of ["/admin", "/admin/orders", "/login", "/forgot-password", "/pos", "/pos/login", "/account", "/account/orders", "/register"]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(404);
      await expect(page.getByText(NOT_FOUND)).toBeVisible();
    }
  });

  test("the sign-in API cannot be used without a link", async ({ request }) => {
    const response = await request.post("/api/auth/sign-in/email", { data: { email: adminEmail, password: PASSWORD } });
    expect(response.status()).toBe(404);
    const signUp = await request.post("/api/auth/sign-up/email", { data: { name: "Someone", email: `signup.${stamp}@example.com`, password: PASSWORD } });
    expect(signUp.status()).toBe(404);
  });

  test("the admin link leads to the sign-in, and from there to the admin", async ({ page }) => {
    await signInToAdmin(page, adminEmail);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Dashboard");
    // The pass stays on the device: the address works from now on.
    await page.goto("/admin/orders");
    await expect(page).toHaveURL(/\/admin\/orders$/);
    // Signed-in staff see the shop like anyone else: no link to the admin.
    await page.goto("/");
    await expect(page.getByRole("link", { name: /Admin/ })).toHaveCount(0);
  });

  test("the till link gives no way into the admin", async ({ page }) => {
    await page.goto(tillLink);
    await expect(page).toHaveURL(/\/pos\/login/);
    const response = await page.goto("/admin");
    expect(response?.status()).toBe(404);
  });

  test("an old customer account cannot sign in", async ({ page }) => {
    await asNewVisitor(page);
    await page.goto(adminLink);
    await fillSignIn(page, customerEmail, PASSWORD);
    await expect(page.getByText("This sign-in is for shop staff only.")).toBeVisible();
  });

  test("five wrong passwords pause an account", async ({ page }) => {
    await asNewVisitor(page);
    await page.goto(adminLink);
    for (let attempt = 0; attempt < 5; attempt++) {
      await fillSignIn(page, lockedEmail, "not-the-password");
      await expect(page.getByText("Incorrect email or password.")).toBeVisible();
      // Fresh visitor each try, as someone moving between addresses would be.
      await asNewVisitor(page);
    }
    await fillSignIn(page, lockedEmail, PASSWORD);
    await expect(page.getByText(/Too many wrong passwords for this account/)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("wrong links stop answering after ten tries from one visitor", async ({ request }) => {
    const headers = { "x-real-ip": `10.88.${stamp % 250}.1` };
    const wrong = `/${randomUUID().replaceAll("-", "").slice(0, 32)}`;
    for (let attempt = 0; attempt < 10; attempt++) {
      expect((await request.get(wrong, { headers, maxRedirects: 0 })).status()).toBe(404);
    }
    expect((await request.get(wrong, { headers, maxRedirects: 0 })).status()).toBe(429);
    expect((await request.get(adminLink, { headers, maxRedirects: 0 })).status()).toBe(303);
  });

  test("the Super Admin adds a cashier and gets a password to pass on", async ({ page }) => {
    await signInToAdmin(page, adminEmail);
    await page.goto("/admin/staff");
    await expect(page.getByText("Admin link")).toBeVisible();
    await expect(page.getByText("Till link")).toBeVisible();

    await page.getByLabel("Full name").fill("New Cashier");
    await page.getByLabel("Email address").fill(newStaffEmail);
    await page.getByRole("button", { name: "Add staff member" }).click();
    const dialog = page.getByRole("dialog", { name: "Temporary password for New Cashier" });
    const password = await dialog.locator("code").textContent();
    expect(password).toHaveLength(16);
    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("row", { name: /New Cashier/ })).toBeVisible();

    const user = await db.user.findUniqueOrThrow({ where: { email: newStaffEmail } });
    expect(user.role).toBe("CASHIER");
  });

  test("a cashier who opens the admin link is sent to the till", async ({ page }) => {
    const email = `gate.cashier.${stamp}@example.com`;
    await createStaff("Gate Cashier", email);
    try {
      await asNewVisitor(page);
      await page.goto(tillLink);
      await fillSignIn(page, email, PASSWORD);
      await page.waitForURL(/\/pos$/);
      await page.goto(adminLink);
      await expect(page).toHaveURL(/\/pos$/);
    } finally {
      await db.user.delete({ where: { email } });
    }
  });
});

test.describe("customers have no accounts", () => {
  test("the shop offers no sign in, and tracking is there instead", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /Sign in|Create account|My account|Wishlist/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /wishlist/i })).toHaveCount(0);
    await page.getByRole("navigation", { name: "Orders and cart" }).getByRole("link", { name: "Track an order" }).click();
    await expect(page).toHaveURL(/\/track-order$/);
  });

  test("server jobs are not reachable without their secret", async ({ request }) => {
    const res = await request.get("/api/cron/expire-orders");
    expect(res.status()).toBe(401);
    const webhook = await request.post("/api/payments/paystack/webhook", { data: { event: "charge.success" } });
    expect(webhook.status()).toBe(401);
  });
});
