import { expect, test } from "@playwright/test";
import { formatMoney, minorToDecimalString } from "../src/lib/money";
import { db } from "./db";
import { createStaff, signInToAdmin, signInToTill } from "./staff";

/**
 * Credit customers end to end: a cashier sells on account to a new customer,
 * takes part of the money later at the till (it counts in the drawer), and a
 * manager sees the statement in the admin and records the rest.
 */
test.describe("credit customers", () => {
  const stamp = Date.now();
  const cashierEmail = `credit.cashier.${stamp}@example.com`;
  const managerEmail = `credit.manager.${stamp}@example.com`;
  const customerName = `Kofi Credit ${stamp}`;
  const phone = `0${String(stamp).slice(-9)}`;
  const barcode = `CR${stamp}`;
  let product = { variantId: "", name: "", priceMinor: 0, stockMilli: 0, barcode: null as string | null };

  test.beforeAll(async () => {
    const variant = await db.productVariant.findFirstOrThrow({
      where: { isActive: true, unit: { not: "KG" }, stockMilli: { gte: 5000 }, salePriceMinor: null, priceTiers: { none: {} }, product: { status: "PUBLISHED" } },
      include: { product: { select: { name: true } } },
    });
    product = { variantId: variant.id, name: variant.product.name, priceMinor: variant.priceMinor, stockMilli: variant.stockMilli, barcode: variant.barcode };
    await db.productVariant.update({ where: { id: variant.id }, data: { barcode } });
    await db.posShift.updateMany({ where: { closedAt: null, till: { code: "T1" } }, data: { closedAt: new Date(), notes: "Closed by the e2e run" } });
  });

  test.afterAll(async () => {
    const customer = await db.creditCustomer.findUnique({ where: { phone } });
    if (customer) {
      await db.creditPayment.deleteMany({ where: { customerId: customer.id } });
      const sales = await db.posSale.findMany({ where: { creditCustomerId: customer.id }, select: { id: true } });
      await db.inventoryMovement.deleteMany({ where: { posSaleId: { in: sales.map((s) => s.id) } } });
      await db.posSale.deleteMany({ where: { creditCustomerId: customer.id } });
      await db.creditCustomer.delete({ where: { id: customer.id } });
    }
    for (const address of [cashierEmail, managerEmail]) {
      const user = await db.user.findUnique({ where: { email: address } });
      if (!user) continue;
      await db.auditLog.deleteMany({ where: { actorId: user.id } });
      await db.posShift.deleteMany({ where: { cashierId: user.id } });
      await db.user.delete({ where: { id: user.id } });
    }
    if (product.variantId) await db.productVariant.update({ where: { id: product.variantId }, data: { barcode: product.barcode, stockMilli: product.stockMilli } });
  });

  test("a sale on account, a payment at the till, and the rest recorded in the admin", async ({ page, browser }) => {
    const total = product.priceMinor * 2;
    const paidAtTill = Math.floor(total / 2);

    await createStaff("Esi Till", cashierEmail);
    await signInToTill(page, cashierEmail);
    await page.goto("/pos");
    await page.getByLabel("Cash in the drawer").fill("100");
    await page.getByRole("button", { name: `Open the till with ${formatMoney(10_000)}` }).click();

    const search = page.getByRole("searchbox", { name: "Search products or scan a barcode" });
    await expect(page.getByRole("main").getByText("Type a product name or scan a barcode")).toBeVisible();
    await search.fill(barcode);
    await search.press("Enter");
    const sale = page.getByRole("region", { name: "Current sale" });
    await sale.getByRole("button", { name: `One more ${product.name}` }).click();
    await sale.getByRole("button", { name: /^Charge/ }).click();

    // On account, to a customer added there and then.
    const pay = page.getByRole("dialog", { name: "Take payment" });
    await pay.getByRole("button", { name: "On account" }).click();
    await pay.getByRole("button", { name: "Complete sale" }).click();
    await expect(pay.getByRole("alert")).toContainText("Choose the customer");
    await pay.getByRole("button", { name: "New customer" }).click();
    await pay.getByLabel("Full name").fill(customerName);
    await pay.getByLabel("Phone number").fill(phone);
    await pay.getByRole("button", { name: "Add customer" }).click();
    await expect(pay.getByText(customerName)).toBeVisible();
    await expect(pay.getByLabel("Put on account")).toHaveValue(minorToDecimalString(total));
    await pay.getByRole("button", { name: "Complete sale" }).click();

    const done = page.getByRole("dialog", { name: "Sale complete" });
    await expect(done).toBeVisible();
    await expect(page.locator(".pos-print")).toContainText(`Customer: ${customerName}`);
    await expect(page.locator(".pos-print")).toContainText("To pay later");
    const customer = await db.creditCustomer.findUniqueOrThrow({ where: { phone } });
    const recorded = await db.posSale.findFirstOrThrow({ where: { creditCustomerId: customer.id }, include: { payments: true } });
    expect(recorded.payments).toMatchObject([{ method: "CREDIT", amountMinor: total }]);
    await done.getByRole("button", { name: "New sale" }).click();

    // Part of it paid in cash at the till.
    await page.getByRole("button", { name: "Credit customers" }).click();
    const sheet = page.getByRole("dialog", { name: "Credit customers" });
    await sheet.getByRole("textbox", { name: "Customer" }).fill(customerName);
    await sheet.getByRole("button", { name: new RegExp(customerName) }).click();
    await expect(sheet.getByText(formatMoney(total)).first()).toBeVisible();
    await sheet.getByLabel("Amount paid").fill(minorToDecimalString(paidAtTill));
    await sheet.getByRole("button", { name: "Record payment" }).click();
    await expect(sheet.getByRole("status")).toContainText(`now owes ${formatMoney(total - paidAtTill)}`);
    await sheet.getByRole("button", { name: "Done" }).click();
    await page.keyboard.press("Escape");

    // The payment is in the drawer: the count balances with the float plus it.
    await page.getByRole("button", { name: "Close shift" }).click();
    const close = page.getByRole("dialog", { name: "Close the shift" });
    await close.getByLabel("Cash in the drawer").fill(minorToDecimalString(10_000 + paidAtTill));
    await close.getByRole("button", { name: "Close the shift" }).click();
    const report = page.getByRole("dialog", { name: "Shift closed" });
    await expect(report.getByRole("row", { name: /^Cash/ })).toContainText("Exact");
    await expect(report).toContainText("sold on account");
    await report.getByRole("button", { name: "Done" }).click();

    // A manager sees the statement and records the rest, paid by mobile money.
    await createStaff("Yaw Manager", managerEmail, "STORE_MANAGER");
    const office = await browser.newContext();
    const admin = await office.newPage();
    await signInToAdmin(admin, managerEmail);
    await admin.goto("/admin/credit");
    await admin.getByRole("link", { name: customerName }).click();
    await expect(admin.getByRole("heading", { level: 1, name: customerName })).toBeVisible();
    await expect(admin.getByText(`Bought on account, receipt ${recorded.receiptNumber}`)).toBeVisible();
    await expect(admin.getByText("Paid by cash")).toBeVisible();
    await admin.getByRole("button", { name: "All", exact: true }).click();
    await admin.getByLabel("Transaction ID").fill("MP26110299");
    await admin.getByRole("button", { name: "Record payment" }).click();
    await expect(admin.getByText(/They now owe GH₵0\.00/)).toBeVisible();
    await expect(admin.getByText("Paid by mobile money")).toBeVisible();
    await office.close();
  });
});
