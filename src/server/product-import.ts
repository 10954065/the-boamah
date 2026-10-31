import "server-only";
import { readSheet } from "read-excel-file/node";
import writeExcelFile from "write-excel-file/node";
import { prisma } from "@/lib/db";
import type { CatalogSnapshot, ImportPlan, NewVariant, SheetRow } from "@/lib/product-import";
import { IMPORT_COLUMNS, MAX_IMPORT_ROWS, readHeader, rowValues } from "@/lib/product-import-sheet";
import { milliToDecimalString, UNIT_INFO, type SellingUnitCode } from "@/lib/quantity";
import { recordAudit } from "@/server/audit";
import { adjustStock } from "@/server/inventory";

/**
 * Reading an uploaded product sheet, the catalogue it is checked against,
 * applying the changes, and the sheet staff download to fill in. What a sheet
 * changes is worked out in lib/product-import.ts.
 */

export const MAX_SHEET_BYTES = 5 * 1024 * 1024;
/** Rows above the headings, such as a title, that are skipped while looking for them. */
const HEADER_SEARCH_ROWS = 10;

/** A sheet that cannot be read at all; the message is for the person who uploaded it. */
export class SheetError extends Error {}

export async function readProductSheet(file: File): Promise<SheetRow[]> {
  if (file.size === 0) throw new SheetError("The file is empty.");
  if (file.size > MAX_SHEET_BYTES) throw new SheetError("The file is larger than 5 MB. Split it into smaller sheets.");
  let cells: unknown[][];
  try {
    // Numbers stay exactly as written (prices, barcodes), not as floating point.
    cells = await readSheet(Buffer.from(await file.arrayBuffer()), 1, { parseNumber: (text) => text });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "XLS_FILE_NOT_SUPPORTED") {
      throw new SheetError("This is an old style .xls file. In Excel, choose File, Save As, Excel Workbook (.xlsx), and upload that.");
    }
    throw new SheetError("This file could not be read as an Excel sheet. Upload an .xlsx file, such as the template.");
  }

  const headerIndex = cells.slice(0, HEADER_SEARCH_ROWS).findIndex((row) => readHeader(row).columns.filter(Boolean).length >= 2);
  if (headerIndex < 0) throw new SheetError(`No headings found. The first row needs ${IMPORT_COLUMNS.filter((c) => c.required).map((c) => `"${c.header}"`).join(", ")}. Start from the template.`);
  const header = readHeader(cells[headerIndex]!);
  if (header.problems.length > 0) throw new SheetError(header.problems.join(" "));

  const rows: SheetRow[] = [];
  cells.slice(headerIndex + 1).forEach((row, index) => {
    const values = rowValues(row, header);
    if (values) rows.push({ row: headerIndex + index + 2, values });
  });
  if (rows.length === 0) throw new SheetError("There are no products under the headings.");
  if (rows.length > MAX_IMPORT_ROWS) throw new SheetError(`The sheet has ${rows.length} rows. Upload up to ${MAX_IMPORT_ROWS} at a time.`);
  return rows;
}

export async function loadCatalogSnapshot(): Promise<CatalogSnapshot> {
  const [categories, products] = await Promise.all([
    prisma.category.findMany({ select: { id: true, name: true, slug: true }, orderBy: { sortOrder: "asc" } }),
    prisma.product.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        categoryId: true,
        brand: true,
        description: true,
        shortDescription: true,
        searchKeywords: true,
        status: true,
        variants: {
          select: { id: true, name: true, sku: true, barcode: true, unit: true, priceMinor: true, salePriceMinor: true, stockMilli: true, lowStockMilli: true, sortOrder: true },
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: { name: "asc" },
    }),
  ]);
  return { categories, products: products.map(({ status, ...product }) => ({ ...product, archived: status === "ARCHIVED" })) };
}

function variantData(variant: NewVariant) {
  return {
    name: variant.name,
    sku: variant.sku,
    barcode: variant.barcode,
    unit: variant.unit,
    priceMinor: variant.priceMinor,
    salePriceMinor: variant.salePriceMinor,
    lowStockMilli: variant.lowStockMilli,
    stockMilli: variant.stockMilli,
  };
}

const STOCK_REASON = "Stock count from the product sheet";

/**
 * Applies a plan with no problems in one transaction: all of it or none.
 * Returns the options that came back into stock, for waiting shoppers.
 */
export async function applyImport(plan: ImportPlan, actorId: string, fileName: string): Promise<string[]> {
  return prisma.$transaction(
    async (tx) => {
      const opening = async (variantId: string, stockMilli: number) => {
        if (stockMilli <= 0) return;
        await tx.inventoryMovement.create({ data: { variantId, type: "INITIAL", deltaMilli: stockMilli, balanceAfterMilli: stockMilli, reason: "Opening stock from the product sheet", actorId } });
      };

      for (const product of plan.newProducts) {
        const created = await tx.product.create({
          data: {
            ...product.fields,
            slug: product.slug,
            status: "DRAFT",
            variants: { create: product.variants.map((variant, index) => ({ ...variantData(variant), isDefault: index === 0, sortOrder: index })) },
          },
          select: { id: true, variants: { select: { id: true, stockMilli: true } } },
        });
        for (const variant of created.variants) await opening(variant.id, variant.stockMilli);
        await recordAudit({ actorId, action: "product.create", entityType: "Product", entityId: created.id, details: { name: product.fields.name, status: "DRAFT", source: "sheet" } }, tx);
      }

      for (const { productId, sortOrder, variant } of plan.newOptions) {
        const created = await tx.productVariant.create({ data: { ...variantData(variant), productId, sortOrder }, select: { id: true } });
        await opening(created.id, variant.stockMilli);
      }

      for (const { productId, data } of plan.productChanges) {
        await tx.product.update({ where: { id: productId }, data });
        await recordAudit({ actorId, action: "product.update", entityType: "Product", entityId: productId, details: { fields: Object.keys(data), source: "sheet" } }, tx);
      }

      for (const { variantId, data, pricesBefore } of plan.variantChanges) {
        // A sale price set from a sheet runs until it is changed again.
        const after = await tx.productVariant.update({
          where: { id: variantId },
          data: { ...data, ...("salePriceMinor" in data ? { saleEndsAt: null } : {}) },
          select: { priceMinor: true, salePriceMinor: true },
        });
        if (pricesBefore) {
          await recordAudit(
            { actorId, action: "variant.price_change", entityType: "ProductVariant", entityId: variantId, details: { from: [...pricesBefore, null], to: [after.priceMinor, after.salePriceMinor, null], source: "sheet" } },
            tx,
          );
        }
      }

      const backInStock: string[] = [];
      for (const { variantId, toMilli } of plan.stockCounts) {
        // The count replaces whatever is there now, even if a sale happened since the sheet was checked.
        const [current] = await tx.$queryRaw<{ stockMilli: number }[]>`SELECT "stockMilli" FROM "ProductVariant" WHERE id = ${variantId} FOR UPDATE`;
        if (!current || current.stockMilli === toMilli) continue;
        await adjustStock(tx, { variantId, deltaMilli: toMilli - current.stockMilli, type: "ADJUSTMENT", reason: STOCK_REASON, actorId });
        if (current.stockMilli <= 0 && toMilli > 0) backInStock.push(variantId);
      }

      await recordAudit({ actorId, action: "product.import", entityType: "Product", details: { fileName, ...plan.counts } }, tx);
      return backInStock;
    },
    // Large sheets are many small writes; the default 5 second limit is for single changes.
    { timeout: 120_000, maxWait: 10_000 },
  );
}

// ---------------------------------------------------------------------------
// The sheet to download: headings, optionally every product already on the
// website, how to fill it in, and the categories and units to choose from.
// ---------------------------------------------------------------------------

const HEADER_STYLE = { fontWeight: "bold", backgroundColor: "#174D33", textColor: "#FFFFFF", height: 22, alignVertical: "center" } as const;
const TEXT = { type: String, format: "@" } as const;

function unitWord(unit: SellingUnitCode): string {
  const word = UNIT_INFO[unit].singular;
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function text(value: string | null) {
  return value ? { value, ...TEXT } : null;
}

export async function productSheet(withProducts: boolean): Promise<Buffer> {
  const snapshot = await loadCatalogSnapshot();
  const header = IMPORT_COLUMNS.map((column) => ({ value: column.required ? `${column.header} *` : column.header, ...HEADER_STYLE }));
  const productRows = withProducts
    ? snapshot.products
        .filter((product) => !product.archived)
        .flatMap((product) =>
          product.variants.map((variant) => {
            const category = snapshot.categories.find((c) => c.id === product.categoryId)?.name ?? null;
            const cells = {
              name: text(product.name),
              option: text(variant.name),
              category: text(category),
              unit: text(unitWord(variant.unit)),
              price: { value: variant.priceMinor / 100, format: "0.00" },
              salePrice: variant.salePriceMinor === null ? null : { value: variant.salePriceMinor / 100, format: "0.00" },
              stock: text(milliToDecimalString(variant.stockMilli)),
              lowStock: text(milliToDecimalString(variant.lowStockMilli)),
              sku: text(variant.sku),
              barcode: text(variant.barcode),
              brand: text(product.brand),
              shortDescription: text(product.shortDescription),
              description: text(product.description),
              searchKeywords: text(product.searchKeywords),
            };
            return IMPORT_COLUMNS.map((column) => cells[column.key]);
          }),
        )
    : [];

  const help = [
    [{ value: "Column", ...HEADER_STYLE }, { value: "Needed?", ...HEADER_STYLE }, { value: "What to write", ...HEADER_STYLE }],
    ...IMPORT_COLUMNS.map((column) => [column.header, column.required ? "Yes, for a new product" : "No", column.help]),
    [null, null, null],
    [{ value: "Good to know", fontWeight: "bold" as const }, null, null],
    ...[
      "Fill in the Products sheet: one row for each size of a product. Rows with the same product name become one product with several sizes.",
      "New products are saved as drafts. Add photos and a description in Admin, Products, then publish them.",
      "A product already on the website is found by its SKU, then its barcode, then its name and size, and is updated from the row.",
      "A blank cell never changes a product already on the website. To end an offer, write 0 under Sale price.",
      "Stock is the number on the shelf now. It replaces the stock on the website and is recorded in the stock history.",
      "Format the Barcode column as Text before typing barcodes, so Excel keeps every digit.",
      "Nothing is saved until you check the preview and press Import. A sheet with any problem imports nothing.",
    ].map((line) => [null, null, line]),
  ];

  const units = Object.keys(UNIT_INFO).map((unit) => unitWord(unit as SellingUnitCode));
  const lists = [
    [{ value: "Categories", ...HEADER_STYLE }, { value: "Sold by", ...HEADER_STYLE }],
    ...Array.from({ length: Math.max(snapshot.categories.length, units.length) }, (_, i) => [snapshot.categories[i]?.name ?? null, units[i] ?? null]),
  ];

  return writeExcelFile(
    [
      { data: [header, ...productRows], sheet: "Products", columns: IMPORT_COLUMNS.map((column) => ({ width: column.width })), stickyRowsCount: 1 },
      { data: help, sheet: "How to fill this in", columns: [{ width: 22 }, { width: 22 }, { width: 110 }] },
      { data: lists, sheet: "Categories", columns: [{ width: 28 }, { width: 14 }], stickyRowsCount: 1 },
    ],
    { fontFamily: "Calibri", fontSize: 11 },
  ).toBuffer();
}
