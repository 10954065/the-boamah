import { z } from "zod";
import { POS_MAX_ITEMS, POS_MAX_QUANTITY_MILLI, type PosSaleUpload, type TenderLine } from "@/lib/pos";
import { effectiveUnitPrice, unitPriceForQuantity, type PriceTierRule } from "@/lib/pricing";
import { MILLI, UNIT_INFO, lineTotalMinor, parseDecimalToMilli, type SellingUnitCode } from "@/lib/quantity";

/**
 * The selling side of the till: catalogue search, the sale being rung up,
 * its prices and the receipt. Pure functions, so the same code runs in the
 * browser whether or not the till is online.
 */

/** One product option as the till sells it, with the shop's live price and stock. */
export interface PosCatalogItem {
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  barcode: string | null;
  unit: SellingUnitCode;
  categoryId: string;
  categoryName: string;
  imageUrl: string | null;
  imageAlt: string;
  priceMinor: number;
  salePriceMinor: number | null;
  saleEndsAt: string | null;
  tiers: PriceTierRule[];
  stockMilli: number;
  lowStockMilli: number;
  /** Lower case words the till search matches. */
  keywords: string;
}

// ---------------------------------------------------------------------------
// Finding products
// ---------------------------------------------------------------------------

/** Exact barcode, then SKU: what a scanner types. */
export function findByCode(items: readonly PosCatalogItem[], code: string): PosCatalogItem | undefined {
  const wanted = code.trim().toUpperCase();
  if (!wanted) return undefined;
  return items.find((item) => item.barcode === wanted) ?? items.find((item) => item.sku.toUpperCase() === wanted);
}

/** Items in the category (or all) whose keywords contain every word typed. */
export function searchCatalog(items: readonly PosCatalogItem[], term: string, categoryId: string | null): PosCatalogItem[] {
  const words = term.toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter((item) => (!categoryId || item.categoryId === categoryId) && words.every((word) => item.keywords.includes(word)));
}

export function catalogCategories(items: readonly PosCatalogItem[]): { id: string; name: string }[] {
  const seen = new Map<string, string>();
  for (const item of items) if (!seen.has(item.categoryId)) seen.set(item.categoryId, item.categoryName);
  return [...seen].map(([id, name]) => ({ id, name }));
}

// ---------------------------------------------------------------------------
// Quantities: weighed goods take any weight to the gram, others whole units.
// ---------------------------------------------------------------------------

export function isWeighed(unit: SellingUnitCode): boolean {
  return UNIT_INFO[unit].divisible;
}

export function parseTillQuantity(text: string, unit: SellingUnitCode): number | null {
  const milli = parseDecimalToMilli(text);
  if (milli === null || milli <= 0 || milli > POS_MAX_QUANTITY_MILLI) return null;
  if (!isWeighed(unit) && milli % MILLI !== 0) return null;
  return milli;
}

// ---------------------------------------------------------------------------
// The sale being rung up. Each line keeps the item as it was when added, so
// the receipt shows what the cashier saw.
// ---------------------------------------------------------------------------

export interface TillLine {
  item: PosCatalogItem;
  quantityMilli: number;
}

export function addToSale(lines: readonly TillLine[], item: PosCatalogItem, quantityMilli: number): TillLine[] {
  if (!lines.some((line) => line.item.variantId === item.variantId)) return [...lines, { item, quantityMilli: Math.min(quantityMilli, POS_MAX_QUANTITY_MILLI) }];
  return lines.map((line) =>
    line.item.variantId === item.variantId ? { ...line, quantityMilli: Math.min(line.quantityMilli + quantityMilli, POS_MAX_QUANTITY_MILLI) } : line,
  );
}

/** Sets a line's quantity; zero or less takes the line off the sale. */
export function setLineQuantity(lines: readonly TillLine[], variantId: string, quantityMilli: number): TillLine[] {
  if (quantityMilli <= 0) return lines.filter((line) => line.item.variantId !== variantId);
  return lines.map((line) => (line.item.variantId === variantId ? { ...line, quantityMilli: Math.min(quantityMilli, POS_MAX_QUANTITY_MILLI) } : line));
}

export interface PricedTillLine extends TillLine {
  unitPriceMinor: number;
  lineTotalMinor: number;
  /** Against the regular shelf price, before sale and bulk prices. */
  savingMinor: number;
  priceNote: "sale" | "bulk" | null;
}

export interface PricedSale {
  lines: PricedTillLine[];
  totalMinor: number;
  savingMinor: number;
}

/** Prices the sale the way the server checks it: sale price and bulk price for the quantity, at `now`. */
export function priceSale(lines: readonly TillLine[], now: Date): PricedSale {
  const priced = lines.map((line): PricedTillLine => {
    const { item, quantityMilli } = line;
    const shelfPrice = effectiveUnitPrice(item, now);
    const unitPriceMinor = unitPriceForQuantity(item, item.tiers, quantityMilli, now);
    const total = lineTotalMinor(unitPriceMinor, quantityMilli);
    return {
      ...line,
      unitPriceMinor,
      lineTotalMinor: total,
      savingMinor: Math.max(0, lineTotalMinor(item.priceMinor, quantityMilli) - total),
      priceNote: unitPriceMinor < shelfPrice ? "bulk" : shelfPrice < item.priceMinor ? "sale" : null,
    };
  });
  return {
    lines: priced,
    totalMinor: priced.reduce((sum, line) => sum + line.lineTotalMinor, 0),
    savingMinor: priced.reduce((sum, line) => sum + line.savingMinor, 0),
  };
}

// ---------------------------------------------------------------------------
// Sales on hold: the customer steps away, the next one is served, and the
// sale is picked up again later. Only what was picked is kept; prices are the
// shelf prices when it is picked up again.
// ---------------------------------------------------------------------------

export const MAX_HELD_SALES = 20;
const MAX_HELD_NOTE = 60;

export interface HeldSale {
  id: string;
  heldAt: string;
  cashierName: string;
  /** Who it is for, typed by the cashier (for example "Lady in the blue dress"). */
  note: string | null;
  lines: { variantId: string; productName: string; variantName: string; quantityMilli: number }[];
  /** The total when it was held, as a guide. */
  totalMinor: number;
}

const heldSaleSchema = z.object({
  id: z.string().min(1).max(64),
  heldAt: z.string(),
  cashierName: z.string(),
  note: z.string().max(MAX_HELD_NOTE).nullable(),
  lines: z
    .array(z.object({ variantId: z.string(), productName: z.string(), variantName: z.string(), quantityMilli: z.number().int().positive().max(POS_MAX_QUANTITY_MILLI) }))
    .min(1)
    .max(POS_MAX_ITEMS),
  totalMinor: z.number().int().min(0),
});

/** The held sales in stored data; anything unreadable is dropped (a held sale is only a list of items). */
export function parseHeldSales(value: unknown): HeldSale[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = heldSaleSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

export function heldSaleOf(sale: PricedSale, note: string, cashierName: string, now: Date): HeldSale {
  return {
    id: crypto.randomUUID(),
    heldAt: now.toISOString(),
    cashierName,
    note: note.trim().slice(0, MAX_HELD_NOTE) || null,
    lines: sale.lines.map((line) => ({
      variantId: line.item.variantId,
      productName: line.item.productName,
      variantName: line.item.variantName,
      quantityMilli: line.quantityMilli,
    })),
    totalMinor: sale.totalMinor,
  };
}

/** The held sale as lines from today's catalogue, and the names of items no longer sold. */
export function resumeHeldSale(held: HeldSale, items: readonly PosCatalogItem[]): { lines: TillLine[]; missing: string[] } {
  const byId = new Map(items.map((item) => [item.variantId, item]));
  const lines: TillLine[] = [];
  const missing: string[] = [];
  for (const line of held.lines) {
    const item = byId.get(line.variantId);
    if (item) lines.push({ item, quantityMilli: line.quantityMilli });
    else missing.push(line.variantName ? `${line.productName} (${line.variantName})` : line.productName);
  }
  return { lines, missing };
}

// ---------------------------------------------------------------------------
// Payment
// ---------------------------------------------------------------------------

// Ghana notes from GH₵5 to GH₵200, in pesewas.
const NOTE_STEPS_MINOR = [500, 1000, 2000, 5000, 10_000, 20_000];

/** The exact amount, then the amounts a customer is likely to hand over. */
export function cashSuggestions(dueMinor: number, max = 5): number[] {
  if (dueMinor <= 0) return [];
  const rounded = NOTE_STEPS_MINOR.map((step) => Math.ceil(dueMinor / step) * step);
  return [...new Set([dueMinor, ...rounded])].toSorted((a, b) => a - b).slice(0, max);
}

export interface TenderProgress {
  paidMinor: number;
  remainingMinor: number;
  changeMinor: number;
}

export function tenderProgress(totalMinor: number, tenders: readonly TenderLine[]): TenderProgress {
  const paidMinor = tenders.reduce((sum, tender) => sum + tender.amountMinor, 0);
  return { paidMinor, remainingMinor: Math.max(0, totalMinor - paidMinor), changeMinor: Math.max(0, paidMinor - totalMinor) };
}

export interface SaleContext {
  clientId: string;
  receiptNumber: string;
  tillCode: string;
  shiftClientId: string | null;
  cashierId: string;
  soldAt: Date;
}

/** The credit customer a sale on account is for. */
export interface SaleCreditCustomer {
  id: string;
  name: string;
  phone: string;
}

export function buildSaleUpload(context: SaleContext, sale: PricedSale, tenders: readonly TenderLine[], creditCustomer: SaleCreditCustomer | null = null): PosSaleUpload {
  const onAccount = tenders.some((tender) => tender.method === "CREDIT");
  return {
    clientId: context.clientId,
    receiptNumber: context.receiptNumber,
    tillCode: context.tillCode,
    shiftClientId: context.shiftClientId,
    cashierId: context.cashierId,
    soldAt: context.soldAt.toISOString(),
    items: sale.lines.map((line) => ({ variantId: line.item.variantId, quantityMilli: line.quantityMilli, unitPriceMinor: line.unitPriceMinor })),
    payments: tenders.map((tender) => ({ method: tender.method, amountMinor: tender.amountMinor, reference: tender.reference?.trim() || null })),
    creditCustomerId: onAccount ? (creditCustomer?.id ?? null) : null,
  };
}

// ---------------------------------------------------------------------------
// Receipt
// ---------------------------------------------------------------------------

export interface ReceiptLine {
  name: string;
  detail: string;
  unit: SellingUnitCode;
  quantityMilli: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
  savingMinor: number;
}

export interface ReceiptData {
  receiptNumber: string;
  soldAt: string;
  tillCode: string;
  cashierName: string;
  lines: ReceiptLine[];
  totalMinor: number;
  savingMinor: number;
  payments: TenderLine[];
  paidMinor: number;
  changeMinor: number;
  /** Whose account the sale (or part of it) went on. */
  creditCustomer?: { name: string; phone: string } | null;
}

export function receiptFor(upload: PosSaleUpload, sale: PricedSale, cashierName: string, creditCustomer: SaleCreditCustomer | null = null): ReceiptData {
  const progress = tenderProgress(sale.totalMinor, upload.payments);
  return {
    receiptNumber: upload.receiptNumber,
    soldAt: upload.soldAt,
    tillCode: upload.tillCode,
    cashierName,
    lines: sale.lines.map((line) => ({
      name: line.item.productName,
      detail: line.item.variantName,
      unit: line.item.unit,
      quantityMilli: line.quantityMilli,
      unitPriceMinor: line.unitPriceMinor,
      lineTotalMinor: line.lineTotalMinor,
      savingMinor: line.savingMinor,
    })),
    totalMinor: sale.totalMinor,
    savingMinor: sale.savingMinor,
    payments: upload.payments.map((p) => ({ method: p.method, amountMinor: p.amountMinor, reference: p.reference ?? null })),
    paidMinor: progress.paidMinor,
    changeMinor: progress.changeMinor,
    creditCustomer: upload.creditCustomerId && creditCustomer ? { name: creditCustomer.name, phone: creditCustomer.phone } : null,
  };
}

// ---------------------------------------------------------------------------
// Keypad entry for amounts and weights on a touch screen.
// ---------------------------------------------------------------------------

const MAX_WHOLE_DIGITS = 7;

/** The text after pressing a keypad key ("0" to "9", ".", "back" or "clear"), allowing `decimals` places. */
export function pressKey(text: string, key: string, decimals: number): string {
  if (key === "clear") return "";
  if (key === "back") return text.slice(0, -1);
  if (key === ".") return decimals > 0 && !text.includes(".") ? `${text || "0"}.` : text;
  if (!/^\d$/.test(key)) return text;
  const [whole = "", fraction] = text.split(".");
  if (fraction !== undefined) return fraction.length < decimals ? text + key : text;
  if (whole.length >= MAX_WHOLE_DIGITS) return text;
  return whole === "0" ? key : text + key;
}
