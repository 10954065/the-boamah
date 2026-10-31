import { formatMoney } from "@/lib/money";
import { formatQuantity, UNIT_INFO, type SellingUnitCode } from "@/lib/quantity";
import { slugify } from "@/lib/utils";
import { readBarcode, readMoney, readQuantity, readSku, readUnit, tooLong, unitTitle, type ColumnKey } from "./product-import-sheet";

/**
 * Works out what an uploaded product sheet changes, against the catalogue as
 * it is now. A row matches an existing option by SKU, then barcode, then
 * product name and size; anything else is new. New products are drafts. A
 * blank cell never changes a product already on the website. Nothing is
 * imported while any row has a problem.
 */

export interface CatalogVariant {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  unit: SellingUnitCode;
  priceMinor: number;
  salePriceMinor: number | null;
  stockMilli: number;
  lowStockMilli: number;
  sortOrder: number;
}

export interface CatalogProduct {
  id: string;
  name: string;
  slug: string;
  categoryId: string;
  brand: string | null;
  description: string;
  shortDescription: string | null;
  searchKeywords: string;
  /** Archived products are found by SKU or barcode, never by name. */
  archived?: boolean;
  variants: CatalogVariant[];
}

export interface CatalogSnapshot {
  categories: { id: string; name: string; slug: string }[];
  products: CatalogProduct[];
}

export interface SheetRow {
  /** The row number in Excel, for messages. */
  row: number;
  values: Partial<Record<ColumnKey, string>>;
}

export interface ProductFields {
  name: string;
  categoryId: string;
  brand: string | null;
  description: string;
  shortDescription: string | null;
  searchKeywords: string;
}

export interface NewVariant {
  name: string;
  sku: string;
  barcode: string | null;
  unit: SellingUnitCode;
  priceMinor: number;
  salePriceMinor: number | null;
  stockMilli: number;
  lowStockMilli: number;
}

export type RowKind = "new-product" | "new-option" | "update" | "unchanged" | "error";

export interface RowOutcome {
  row: number;
  product: string;
  option: string;
  kind: RowKind;
  /** What changes, or what is wrong. */
  notes: string[];
}

export interface ImportPlan {
  rows: RowOutcome[];
  newProducts: { slug: string; fields: ProductFields; variants: NewVariant[] }[];
  newOptions: { productId: string; sortOrder: number; variant: NewVariant }[];
  productChanges: { productId: string; data: Partial<ProductFields> }[];
  variantChanges: {
    variantId: string;
    data: { name?: string; priceMinor?: number; salePriceMinor?: number | null; lowStockMilli?: number; barcode?: string };
    /** The prices before, when the import changes them. */
    pricesBefore: [number, number | null] | null;
  }[];
  stockCounts: { variantId: string; fromMilli: number; toMilli: number }[];
  counts: Record<RowKind, number>;
}

const DEFAULT_LOW_STOCK = 5000;
const PRODUCT_TEXT = ["brand", "description", "shortDescription", "searchKeywords"] as const;
const FIELD_LABELS: Record<keyof ProductFields, string> = {
  name: "Name",
  categoryId: "Category",
  brand: "Brand",
  description: "Description",
  shortDescription: "Short description",
  searchKeywords: "Search words",
};

interface ParsedRow {
  row: number;
  errors: string[];
  name: string;
  option: string | null;
  categoryId: string | null;
  unit: SellingUnitCode | null;
  price: number | null;
  /** 0 ends an offer. */
  salePrice: number | null;
  stock: number | null;
  lowStock: number | null;
  sku: string | null;
  barcode: string | null;
  text: Record<(typeof PRODUCT_TEXT)[number], string | null>;
}

function parseRow({ row, values }: SheetRow, snapshot: CatalogSnapshot): ParsedRow {
  const errors: string[] = [];
  for (const [key, text] of Object.entries(values) as [ColumnKey, string][]) {
    const long = tooLong(key, text);
    if (long) errors.push(long);
  }
  const name = values.name ?? "";
  if (name.length < 2) errors.push("Product name is missing.");

  let categoryId: string | null = null;
  if (values.category) {
    const wanted = values.category.toLowerCase();
    const category = snapshot.categories.find((c) => c.name.toLowerCase() === wanted || c.slug === wanted);
    if (category) categoryId = category.id;
    else errors.push(`There is no category called "${values.category}". Use one from the Categories sheet, or add it in Admin, Categories first.`);
  }
  const unit = values.unit ? readUnit(values.unit) : null;
  if (values.unit && !unit) errors.push(`"${values.unit}" is not a unit the shop sells by. Use one from the Categories sheet.`);

  const money = (key: "price" | "salePrice", label: string) => {
    if (!values[key]) return null;
    const amount = readMoney(values[key]);
    if (amount === null) errors.push(`${label} "${values[key]}" is not an amount like 12.50.`);
    return amount;
  };
  const quantity = (key: "stock" | "lowStock", label: string) => {
    if (!values[key]) return null;
    const amount = readQuantity(values[key]);
    if (amount === null) errors.push(`${label} "${values[key]}" is not a number like 12 or 2.5.`);
    return amount;
  };
  const code = (key: "sku" | "barcode") => {
    if (!values[key]) return null;
    const read = key === "sku" ? readSku(values[key]) : readBarcode(values[key]);
    if ("error" in read) errors.push(read.error);
    return "value" in read ? read.value : null;
  };

  const price = money("price", "Price");
  if (price === 0) errors.push("Price must be more than zero.");
  return {
    row,
    errors,
    name,
    option: values.option ?? null,
    categoryId,
    unit,
    price,
    salePrice: money("salePrice", "Sale price"),
    stock: quantity("stock", "Stock"),
    lowStock: quantity("lowStock", "Low stock alert"),
    sku: code("sku"),
    barcode: code("barcode"),
    text: { brand: values.brand ?? null, description: values.description ?? null, shortDescription: values.shortDescription ?? null, searchKeywords: values.searchKeywords ?? null },
  };
}

type Target = { kind: "variant"; product: CatalogProduct; variant: CatalogVariant } | { kind: "option"; product: CatalogProduct } | { kind: "new"; key: string };

/** Which option, product or new product a row is about. */
function findTarget(row: ParsedRow, snapshot: CatalogSnapshot, bySku: Map<string, [CatalogProduct, CatalogVariant]>, byBarcode: Map<string, [CatalogProduct, CatalogVariant]>): Target | string {
  if (row.sku && bySku.has(row.sku)) {
    const [product, variant] = bySku.get(row.sku)!;
    return { kind: "variant", product, variant };
  }
  if (row.barcode && byBarcode.has(row.barcode)) {
    const [product, variant] = byBarcode.get(row.barcode)!;
    if (row.sku) return `This barcode belongs to ${product.name} (${variant.name}, SKU ${variant.sku}). Use that SKU, or check the barcode.`;
    return { kind: "variant", product, variant };
  }
  const named = snapshot.products.filter((p) => !p.archived && p.name.toLowerCase() === row.name.toLowerCase());
  if (named.length > 1) return `Several products are called ${row.name}. Add the SKU to say which one.`;
  const product = named[0];
  if (!product) return { kind: "new", key: row.name.toLowerCase() };
  if (row.option) {
    const variant = product.variants.find((v) => v.name.toLowerCase() === row.option!.toLowerCase());
    if (!variant) return { kind: "option", product };
    return row.sku ? skuMismatch(row.sku, product, variant) : { kind: "variant", product, variant };
  }
  if (product.variants.length === 1) return row.sku ? skuMismatch(row.sku, product, product.variants[0]!) : { kind: "variant", product, variant: product.variants[0]! };
  return `${product.name} has several sizes. Fill in Size or option, or the SKU, to say which one.`;
}

/** SKUs are never changed by a sheet, so a different one on a known product and size is a mistake. */
function skuMismatch(sku: string, product: CatalogProduct, variant: CatalogVariant): string {
  return `SKU ${sku} is not on the website, but ${product.name} (${variant.name}) is, with SKU ${variant.sku}. Use that SKU.`;
}

function uniqueName(base: string, taken: Set<string>, limit: number, separator: string): string {
  let candidate = base.slice(0, limit);
  for (let n = 2; taken.has(candidate); n += 1) candidate = `${base.slice(0, limit - String(n).length - 1)}${separator}${n}`;
  taken.add(candidate);
  return candidate;
}

function moneyOrNone(minor: number | null): string {
  return minor === null ? "none" : formatMoney(minor);
}

/** Checks a new option's own values and fills in the defaults. */
function newVariant(row: ParsedRow, optionName: string | null, skus: Set<string>, productName: string): NewVariant | null {
  if (row.price === null) row.errors.push("Price is needed for a new product or size.");
  const unit = row.unit ?? "ITEM";
  const name = optionName ?? unitTitle(unit);
  if (row.salePrice !== null && row.price !== null && row.salePrice > 0 && row.salePrice >= row.price) row.errors.push("Sale price must be lower than the price.");
  if (!UNIT_INFO[unit].divisible && row.stock !== null && row.stock % 1000 !== 0) row.errors.push(`Stock must be a whole number of ${UNIT_INFO[unit].plural}.`);
  if (row.errors.length > 0 || row.price === null) return null;
  const sku = row.sku ?? uniqueName(slugify(`${productName} ${name}`).toUpperCase().replace(/-+$/, "") || "ITEM", skus, 36, "-");
  return {
    name,
    sku: sku.length >= 3 ? sku : uniqueName(`SKU-${sku}`, skus, 36, "-"),
    barcode: row.barcode,
    unit,
    priceMinor: row.price,
    salePriceMinor: row.salePrice || null,
    stockMilli: row.stock ?? 0,
    lowStockMilli: row.lowStock ?? DEFAULT_LOW_STOCK,
  };
}

/** The changes a row makes to an option already on the website, as notes. */
function changeVariant(row: ParsedRow, variant: CatalogVariant, plan: ImportPlan): string[] {
  const notes: string[] = [];
  const data: ImportPlan["variantChanges"][number]["data"] = {};
  if (row.unit && row.unit !== variant.unit) row.errors.push(`This size is sold by the ${UNIT_INFO[variant.unit].singular}. Change the unit in Admin, Products.`);
  if (row.option && row.option !== variant.name) {
    data.name = row.option;
    notes.push(`Size name: ${row.option}`);
  }
  const price = row.price ?? variant.priceMinor;
  const sale = row.salePrice === null ? variant.salePriceMinor : row.salePrice || null;
  if (sale !== null && sale >= price) row.errors.push(`Sale price ${formatMoney(sale)} must be lower than the price ${formatMoney(price)}. Write 0 under Sale price to end the offer.`);
  if (price !== variant.priceMinor) {
    data.priceMinor = price;
    notes.push(`Price ${formatMoney(variant.priceMinor)} → ${formatMoney(price)}`);
  }
  if (sale !== variant.salePriceMinor) {
    data.salePriceMinor = sale;
    notes.push(sale === null ? "Offer ends" : `Sale price ${moneyOrNone(variant.salePriceMinor)} → ${formatMoney(sale)}`);
  }
  if (row.lowStock !== null && row.lowStock !== variant.lowStockMilli) {
    data.lowStockMilli = row.lowStock;
    notes.push(`Low stock alert ${formatQuantity(variant.lowStockMilli, variant.unit)} → ${formatQuantity(row.lowStock, variant.unit)}`);
  }
  if (row.barcode && row.barcode !== variant.barcode) {
    data.barcode = row.barcode;
    notes.push(`Barcode: ${row.barcode}`);
  }
  if (row.stock !== null && row.stock !== variant.stockMilli) {
    if (!UNIT_INFO[variant.unit].divisible && row.stock % 1000 !== 0) row.errors.push(`Stock must be a whole number of ${UNIT_INFO[variant.unit].plural}.`);
    else {
      plan.stockCounts.push({ variantId: variant.id, fromMilli: variant.stockMilli, toMilli: row.stock });
      notes.push(`Stock ${formatQuantity(variant.stockMilli, variant.unit)} → ${formatQuantity(row.stock, variant.unit)}`);
    }
  }
  const pricesBefore: [number, number | null] | null = "priceMinor" in data || "salePriceMinor" in data ? [variant.priceMinor, variant.salePriceMinor] : null;
  if (Object.keys(data).length > 0) plan.variantChanges.push({ variantId: variant.id, data, pricesBefore });
  return notes;
}

/** Product details shared by the rows of one product: the first filled-in value counts, and a different one is a problem. */
function groupFields(rows: ParsedRow[]): Partial<ProductFields> {
  const fields: Partial<ProductFields> = {};
  const from: Partial<Record<keyof ProductFields, number>> = {};
  const take = (row: ParsedRow, key: keyof ProductFields, value: string | null) => {
    if (value === null) return;
    if (fields[key] === undefined) {
      fields[key] = value;
      from[key] = row.row;
    } else if (key === "name" ? fields.name!.toLowerCase() !== value.toLowerCase() : fields[key] !== value) {
      row.errors.push(`${FIELD_LABELS[key]} is different from row ${from[key]} for the same product. Make them match.`);
    }
  };
  for (const row of rows) {
    take(row, "name", row.name);
    take(row, "categoryId", row.categoryId);
    for (const key of PRODUCT_TEXT) take(row, key, row.text[key]);
  }
  return fields;
}

export function planImport(sheetRows: readonly SheetRow[], snapshot: CatalogSnapshot): ImportPlan {
  const plan: ImportPlan = { rows: [], newProducts: [], newOptions: [], productChanges: [], variantChanges: [], stockCounts: [], counts: { "new-product": 0, "new-option": 0, update: 0, unchanged: 0, error: 0 } };
  const bySku = new Map<string, [CatalogProduct, CatalogVariant]>();
  const byBarcode = new Map<string, [CatalogProduct, CatalogVariant]>();
  for (const product of snapshot.products) {
    for (const variant of product.variants) {
      bySku.set(variant.sku, [product, variant]);
      if (variant.barcode) byBarcode.set(variant.barcode, [product, variant]);
    }
  }
  const rows = sheetRows.map((row) => parseRow(row, snapshot));
  // Codes typed in the sheet are reserved before any are made up.
  const skus = new Set([...bySku.keys(), ...rows.flatMap((row) => (row.sku ? [row.sku] : []))]);
  const slugs = new Set(snapshot.products.map((p) => p.slug));

  const targets = new Map<ParsedRow, Target>();
  const groups = new Map<string, { product: CatalogProduct | null; rows: ParsedRow[] }>();
  const firstRowOf = { sku: new Map<string, number>(), barcode: new Map<string, number>(), option: new Map<string, number>() };
  const once = (map: Map<string, number>, key: string, row: ParsedRow, message: string) => {
    const earlier = map.get(key);
    if (earlier !== undefined) row.errors.push(`${message} as row ${earlier}.`);
    else map.set(key, row.row);
  };
  for (const row of rows) {
    if (row.sku) once(firstRowOf.sku, row.sku, row, "Same SKU");
    if (row.barcode) once(firstRowOf.barcode, row.barcode, row, "Same barcode");
    if (row.name.length < 2) continue;
    const target = findTarget(row, snapshot, bySku, byBarcode);
    if (typeof target === "string") {
      row.errors.push(target);
      continue;
    }
    targets.set(row, target);
    const optionKey = target.kind === "variant" ? target.variant.id : `${target.kind === "new" ? target.key : target.product.id}/${(row.option ?? "").toLowerCase()}`;
    once(firstRowOf.option, optionKey, row, "Same product and size");
    const owner = row.barcode ? byBarcode.get(row.barcode) : undefined;
    if (owner && !(target.kind === "variant" && owner[1].id === target.variant.id)) row.errors.push(`Barcode ${row.barcode} is already on ${owner[0].name} (${owner[1].name}).`);
    const groupKey = target.kind === "new" ? `new:${target.key}` : target.product.id;
    const group = groups.get(groupKey) ?? { product: target.kind === "new" ? null : target.product, rows: [] };
    group.rows.push(row);
    groups.set(groupKey, group);
  }

  const notes = new Map<ParsedRow, { kind: RowKind; notes: string[] }>();
  for (const group of groups.values()) {
    const fields = groupFields(group.rows);
    const [first] = group.rows;
    if (!group.product) {
      if (!fields.categoryId) first!.errors.push("Category is needed for a new product.");
      if (group.rows.length > 1) for (const row of group.rows) if (!row.option) row.errors.push("This product has several sizes: give each one a name under Size or option.");
      const variants = group.rows.map((row) => newVariant(row, row.option, skus, fields.name ?? row.name));
      if (variants.every((v): v is NewVariant => v !== null) && fields.categoryId) {
        plan.newProducts.push({
          slug: uniqueName(slugify(fields.name!) || "product", slugs, 80, "-"),
          fields: { name: fields.name!, categoryId: fields.categoryId, brand: fields.brand ?? null, description: fields.description ?? "", shortDescription: fields.shortDescription ?? null, searchKeywords: fields.searchKeywords ?? "" },
          variants,
        });
      }
      variants.forEach((variant, i) => notes.set(group.rows[i]!, { kind: "new-product", notes: variant ? [`Draft, ${formatMoney(variant.priceMinor)} ${UNIT_INFO[variant.unit].per}, ${formatQuantity(variant.stockMilli, variant.unit)} in stock`] : [] }));
      continue;
    }

    const product = group.product;
    const changed: Partial<ProductFields> = {};
    const productNotes: string[] = [];
    for (const key of Object.keys(fields) as (keyof ProductFields)[]) {
      const value = fields[key]!;
      if (value === (product[key] ?? "")) continue;
      changed[key] = value;
      const category = key === "categoryId" ? snapshot.categories.find((c) => c.id === value)?.name : null;
      productNotes.push(
        key === "name" ? `Renamed from ${product.name} to ${value}` : key === "brand" ? `Brand: ${value}` : category ? `Category: ${category}` : `${FIELD_LABELS[key]} updated`,
      );
    }
    if (Object.keys(changed).length > 0) plan.productChanges.push({ productId: product.id, data: changed });
    let nextSort = Math.max(-1, ...product.variants.map((v) => v.sortOrder)) + 1;
    group.rows.forEach((row, i) => {
      const target = targets.get(row)!;
      const shared = i === 0 ? productNotes : [];
      if (target.kind === "variant") {
        const variantNotes = changeVariant(row, target.variant, plan);
        notes.set(row, { kind: shared.length + variantNotes.length > 0 ? "update" : "unchanged", notes: [...shared, ...variantNotes] });
        return;
      }
      const variant = newVariant(row, row.option, skus, product.name);
      if (variant) plan.newOptions.push({ productId: product.id, sortOrder: nextSort++, variant });
      notes.set(row, { kind: "new-option", notes: [...shared, ...(variant ? [`New size, ${formatMoney(variant.priceMinor)} ${UNIT_INFO[variant.unit].per}`] : [])] });
    });
  }

  for (const row of rows) {
    const outcome = notes.get(row);
    const kind = row.errors.length > 0 ? "error" : (outcome?.kind ?? "unchanged");
    plan.counts[kind] += 1;
    plan.rows.push({ row: row.row, product: row.name, option: row.option ?? "", kind, notes: row.errors.length > 0 ? row.errors : (outcome?.notes ?? []) });
  }
  return plan;
}
