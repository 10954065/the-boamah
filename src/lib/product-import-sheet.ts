import { parseDecimalToMinor } from "@/lib/money";
import { parseDecimalToMilli, UNIT_INFO, type SellingUnitCode } from "@/lib/quantity";

/**
 * The Excel sheet for adding and updating products: its columns, how a
 * header row is recognised, and how each cell is read. One row is one size or
 * option of a product. Planning what the rows change is product-import.ts.
 */

export type ColumnKey =
  | "name"
  | "option"
  | "category"
  | "unit"
  | "price"
  | "salePrice"
  | "stock"
  | "lowStock"
  | "sku"
  | "barcode"
  | "brand"
  | "shortDescription"
  | "description"
  | "searchKeywords";

export interface ImportColumn {
  key: ColumnKey;
  header: string;
  /** Needed on every new product. */
  required: boolean;
  width: number;
  /** What to write, for the instructions sheet. */
  help: string;
  /** Other headings people use for the same thing, compared after normalising. */
  aliases: readonly string[];
}

export const IMPORT_COLUMNS: readonly ImportColumn[] = [
  { key: "name", header: "Product name", required: true, width: 34, help: "The name shoppers see, e.g. Royal Basmati Rice.", aliases: ["name", "product", "item", "item name"] },
  { key: "option", header: "Size or option", required: false, width: 20, help: "e.g. 5 kg bag or 1 litre. Leave blank when the product has one size.", aliases: ["size", "option", "variant", "pack size"] },
  { key: "category", header: "Category", required: true, width: 22, help: "One of the categories on the Categories sheet.", aliases: ["category name", "department"] },
  { key: "unit", header: "Sold by", required: false, width: 12, help: "One of the units on the Categories sheet. Blank means Item.", aliases: ["unit", "selling unit", "uom"] },
  { key: "price", header: "Price (GH₵)", required: true, width: 13, help: "The shelf price, e.g. 48.50.", aliases: ["price", "selling price", "unit price", "price ghs", "price gh"] },
  { key: "salePrice", header: "Sale price (GH₵)", required: false, width: 15, help: "A lower price while on offer. Write 0 to end an offer.", aliases: ["sale price", "offer price", "promo price"] },
  { key: "stock", header: "Stock", required: false, width: 10, help: "How many are on the shelf now. 2.5 is allowed for kg and litres.", aliases: ["quantity", "qty", "stock quantity", "in stock", "stock count"] },
  { key: "lowStock", header: "Low stock alert at", required: false, width: 17, help: "Warn when stock falls to this. Blank means 5.", aliases: ["low stock", "reorder level", "reorder at"] },
  { key: "sku", header: "SKU", required: false, width: 22, help: "The shop's own code. Blank makes one. Letters, numbers and hyphens.", aliases: ["code", "item code", "product code"] },
  { key: "barcode", header: "Barcode", required: false, width: 18, help: "The number under the barcode, scanned at the till.", aliases: ["ean", "upc", "barcode number"] },
  { key: "brand", header: "Brand", required: false, width: 16, help: "The maker, e.g. Nestlé.", aliases: ["make", "manufacturer"] },
  { key: "shortDescription", header: "Short description", required: false, width: 36, help: "One line under the name on the website.", aliases: ["summary", "short desc"] },
  { key: "description", header: "Description", required: false, width: 50, help: "The full description. Needed before a product is published.", aliases: ["details", "long description"] },
  { key: "searchKeywords", header: "Search words", required: false, width: 30, help: "Other words shoppers might search for, e.g. rice basmati.", aliases: ["keywords", "search keywords", "tags"] },
];

export const MAX_IMPORT_ROWS = 2000;

const TEXT_LIMITS: Partial<Record<ColumnKey, number>> = {
  name: 120,
  option: 60,
  category: 80,
  brand: 80,
  shortDescription: 240,
  description: 5000,
  searchKeywords: 300,
};

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/gh₵|ghs|₵|\*/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const HEADER_LOOKUP = new Map<string, ColumnKey>(IMPORT_COLUMNS.flatMap((column) => [column.header, ...column.aliases].map((text) => [normalise(text), column.key] as const)));

export interface HeaderMap {
  /** The column each cell of a row belongs to, or null for a column the import ignores. */
  columns: (ColumnKey | null)[];
  problems: string[];
}

export function readHeader(cells: readonly unknown[]): HeaderMap {
  const seen = new Set<ColumnKey>();
  const problems: string[] = [];
  const columns = cells.map((cell) => {
    const key = typeof cell === "string" ? (HEADER_LOOKUP.get(normalise(cell)) ?? null) : null;
    if (!key) return null;
    if (seen.has(key)) {
      problems.push(`The sheet has two "${headerOf(key)}" columns. Keep one.`);
      return null;
    }
    seen.add(key);
    return key;
  });
  const missing = IMPORT_COLUMNS.filter((column) => column.required && !seen.has(column.key)).map((column) => `"${column.header}"`);
  if (missing.length > 0) problems.push(`The first row needs the column${missing.length === 1 ? "" : "s"} ${missing.join(", ")}. Start from the template.`);
  return { columns, problems };
}

export function headerOf(key: ColumnKey): string {
  return IMPORT_COLUMNS.find((column) => column.key === key)!.header;
}

/** A cell as text: numbers arrive as written in the file (the reader keeps them as strings). */
export function cellText(cell: unknown): string {
  if (cell === null || cell === undefined) return "";
  if (cell instanceof Date) return Number.isNaN(cell.getTime()) ? "" : cell.toISOString().slice(0, 10);
  return String(cell).replace(/\s+/g, " ").trim();
}

/** A row as text by column, with blank cells left out. Null for a blank row. */
export function rowValues(cells: readonly unknown[], header: HeaderMap): Partial<Record<ColumnKey, string>> | null {
  const values: Partial<Record<ColumnKey, string>> = {};
  header.columns.forEach((key, index) => {
    const text = key ? cellText(cells[index]) : "";
    // Descriptions keep their line breaks.
    if (key && text) values[key] = key === "description" ? String(cells[index]).trim() : text;
  });
  return Object.keys(values).length > 0 ? values : null;
}

export function tooLong(key: ColumnKey, text: string): string | null {
  const limit = TEXT_LIMITS[key];
  return limit && text.length > limit ? `${headerOf(key)} is longer than ${limit} characters.` : null;
}

/** "GH₵ 1,250.5" or 1250.5 as pesewas. */
export function readMoney(text: string): number | null {
  return parseDecimalToMinor(text.replace(/gh₵|ghs|₵|\s/gi, ""));
}

export function readQuantity(text: string): number | null {
  return parseDecimalToMilli(text.replace(/,/g, ""));
}

const UNIT_WORDS = new Map<string, SellingUnitCode>([
  ...Object.entries(UNIT_INFO).flatMap(([code, info]) => [
    [code.toLowerCase(), code as SellingUnitCode] as const,
    [info.singular, code as SellingUnitCode] as const,
    [info.plural, code as SellingUnitCode] as const,
  ]),
  ["each", "ITEM"],
  ["piece", "ITEM"],
  ["pieces", "ITEM"],
  ["pcs", "ITEM"],
  ["pc", "ITEM"],
  ["kilo", "KG"],
  ["kilos", "KG"],
  ["kilogram", "KG"],
  ["kilograms", "KG"],
  ["kgs", "KG"],
  ["l", "LITRE"],
  ["liter", "LITRE"],
  ["liters", "LITRE"],
  ["case", "BOX"],
  ["carton", "BOX"],
  ["sack", "BAG"],
  ["can", "TIN"],
  ["cans", "TIN"],
]);

export function readUnit(text: string): SellingUnitCode | null {
  return UNIT_WORDS.get(text.toLowerCase().trim()) ?? null;
}

/** "Bag" for BAG: the option name of a product with one size. */
export function unitTitle(unit: SellingUnitCode): string {
  const word = UNIT_INFO[unit].singular;
  return word === "kg" ? "Per kg" : word.charAt(0).toUpperCase() + word.slice(1);
}

const SKU_PATTERN = /^[A-Z0-9-]{3,40}$/;
const BARCODE_PATTERN = /^[A-Z0-9-]{4,40}$/;

export function readSku(text: string): { value: string } | { error: string } {
  const value = text.toUpperCase();
  return SKU_PATTERN.test(value) ? { value } : { error: "SKU must be 3 to 40 letters, numbers or hyphens." };
}

export function readBarcode(text: string): { value: string } | { error: string } {
  const value = text.toUpperCase();
  if (/\d[.,]\d*E\+?\d+$/i.test(value)) return { error: "Excel shortened this barcode (it shows an E+). Format the Barcode column as Text and type it again." };
  return BARCODE_PATTERN.test(value) ? { value } : { error: "Barcode must be 4 to 40 letters, numbers or hyphens." };
}
