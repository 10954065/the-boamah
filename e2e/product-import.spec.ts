import { expect, test, type Page } from "@playwright/test";
import { readSheet } from "read-excel-file/node";
import writeExcelFile from "write-excel-file/node";
import { db } from "./db";
import { createStaff, signInToAdmin } from "./staff";

const HEADINGS = ["Product name", "Size or option", "Category", "Sold by", "Price (GH₵)", "Stock", "SKU", "Brand", "Description"];

async function chooseSheet(page: Page, rows: (string | number | null)[][]): Promise<void> {
  const buffer = await writeExcelFile([HEADINGS, ...rows]).toBuffer();
  await page.locator("#product-sheet").setInputFiles({ name: "products.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer });
}

/**
 * A manager downloads the product sheet, uploads one with a mistake (nothing
 * is imported), then the corrected one: a new product arrives as a draft with
 * its opening stock, and a product already on the website gets its new price
 * and stock count.
 */
test.describe("importing products from Excel", () => {
  const stamp = Date.now();
  const email = `import.manager.${stamp}@example.com`;
  const sku = `E2E-IMPORT-${stamp}`;
  const newName = `E2E Import Gari ${stamp}`;
  let category = { id: "", name: "" };
  let existingId = "";

  test.beforeAll(async () => {
    category = await db.category.findFirstOrThrow({ where: { isActive: true }, select: { id: true, name: true } });
    const product = await db.product.create({
      data: {
        name: `E2E Import Beans ${stamp}`,
        slug: `e2e-import-beans-${stamp}`,
        description: "Beans for the import test.",
        categoryId: category.id,
        variants: { create: { name: "Bag", sku, unit: "BAG", priceMinor: 1000, stockMilli: 5000, isDefault: true } },
      },
    });
    existingId = product.id;
  });

  test.afterAll(async () => {
    const products = await db.product.findMany({ where: { OR: [{ id: existingId }, { name: newName }] }, select: { id: true } });
    const ids = products.map((p) => p.id);
    await db.inventoryMovement.deleteMany({ where: { variant: { productId: { in: ids } } } });
    await db.product.deleteMany({ where: { id: { in: ids } } });
    const user = await db.user.findUnique({ where: { email } });
    if (user) {
      await db.auditLog.deleteMany({ where: { actorId: user.id } });
      await db.user.delete({ where: { id: user.id } });
    }
  });

  test("a manager checks a sheet, fixes it and imports new and changed products", async ({ page }) => {
    await createStaff("Esi Import", email, "STORE_MANAGER");
    await signInToAdmin(page, email);
    await page.goto("/admin/products");
    await page.getByRole("link", { name: "Import from Excel" }).click();
    await expect(page.getByRole("heading", { name: "Import products from Excel" })).toBeVisible();

    // The sheet of current products lists the one about to be changed, with its SKU.
    const current = await page.request.get("/admin/products/import/template?products=all");
    expect(current.headers()["content-type"]).toContain("spreadsheetml");
    const currentRows = await readSheet(Buffer.from(await current.body()), 1, { parseNumber: (text) => text });
    expect(currentRows[0]).toContain("Product name *");
    expect(currentRows.find((row) => row.includes(sku))).toEqual(expect.arrayContaining([`E2E Import Beans ${stamp}`, "Bag", category.name, "10", "5"]));

    // A sheet with a mistake shows it on its row and imports nothing.
    await chooseSheet(page, [
      [newName, null, "No such category", "bag", "20", "12", null, "Gold Coast", "Fine white gari in a bag."],
      [`E2E Import Beans ${stamp}`, "Bag", null, null, "11.50", "8", sku, null, null],
    ]);
    const table = page.getByRole("table");
    await expect(table.getByRole("row", { name: new RegExp(newName) })).toContainText('There is no category called "No such category"');
    await expect(page.getByRole("button", { name: /^Import \d+ row/ })).toBeDisabled();

    // The corrected sheet: one new product and one update.
    await chooseSheet(page, [
      [newName, null, category.name, "bag", "20", "12", null, "Gold Coast", "Fine white gari in a bag."],
      [`E2E Import Beans ${stamp}`, "Bag", null, null, "11.50", "8", sku, null, null],
    ]);
    await expect(table.getByRole("row", { name: new RegExp(newName) })).toContainText("New product");
    await expect(table.getByRole("row", { name: /E2E Import Beans/ })).toContainText("Price GH₵10.00 → GH₵11.50");
    await expect(table.getByRole("row", { name: /E2E Import Beans/ })).toContainText("Stock 5 bags → 8 bags");
    await page.getByRole("button", { name: "Import 2 rows" }).click();
    await expect(page.getByText("Imported: 1 new product row saved as drafts, 1 row updated.")).toBeVisible();

    const created = await db.product.findFirstOrThrow({ where: { name: newName }, include: { variants: { include: { movements: true } } } });
    expect(created).toMatchObject({ status: "DRAFT", brand: "Gold Coast", categoryId: category.id, description: "Fine white gari in a bag." });
    expect(created.variants).toEqual([expect.objectContaining({ name: "Bag", unit: "BAG", priceMinor: 2000, stockMilli: 12000, isDefault: true })]);
    expect(created.variants[0]!.movements).toEqual([expect.objectContaining({ type: "INITIAL", deltaMilli: 12000 })]);

    const updated = await db.productVariant.findUniqueOrThrow({ where: { sku }, include: { movements: true } });
    expect(updated).toMatchObject({ priceMinor: 1150, stockMilli: 8000 });
    expect(updated.movements).toEqual([expect.objectContaining({ type: "ADJUSTMENT", deltaMilli: 3000, balanceAfterMilli: 8000 })]);

    // Uploading the same sheet again changes nothing.
    await page.getByRole("button", { name: "import another sheet" }).click();
    await chooseSheet(page, [
      [newName, null, category.name, "bag", "20", "12", null, "Gold Coast", "Fine white gari in a bag."],
      [`E2E Import Beans ${stamp}`, "Bag", null, null, "11.50", "8", sku, null, null],
    ]);
    await expect(page.getByRole("button", { name: "Nothing to import" })).toBeDisabled();
  });
});
