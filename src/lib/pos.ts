import { z } from "zod";
import { formatMoney } from "@/lib/money";

/**
 * In-shop point of sale rules shared by the till (in the browser, possibly
 * offline) and the server that records uploaded sales.
 */

export const POS_TENDERS = ["CASH", "MOMO", "CARD"] as const;
export type PosTenderCode = (typeof POS_TENDERS)[number];

export const POS_TENDER_LABELS: Record<PosTenderCode, string> = {
  CASH: "Cash",
  MOMO: "Mobile money",
  CARD: "Card",
};

// ---------------------------------------------------------------------------
// Receipt numbers: issued on the till so it can sell offline, e.g. T1-000231.
// ---------------------------------------------------------------------------

export const TILL_CODE_PATTERN = /^[A-Z][A-Z0-9]{0,3}$/;
const RECEIPT_DIGITS = 6;
const RECEIPT_PATTERN = /^([A-Z][A-Z0-9]{0,3})-(\d{6})$/;
export const MAX_RECEIPT_SEQUENCE = 10 ** RECEIPT_DIGITS - 1;

export function formatReceiptNumber(tillCode: string, sequence: number): string {
  if (!TILL_CODE_PATTERN.test(tillCode)) throw new Error(`Invalid till code: ${tillCode}`);
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > MAX_RECEIPT_SEQUENCE) throw new Error(`Invalid receipt sequence: ${sequence}`);
  return `${tillCode}-${String(sequence).padStart(RECEIPT_DIGITS, "0")}`;
}

export function parseReceiptNumber(value: string): { tillCode: string; sequence: number } | null {
  const match = RECEIPT_PATTERN.exec(value);
  if (!match) return null;
  const sequence = Number(match[2]);
  return sequence >= 1 ? { tillCode: match[1]!, sequence } : null;
}

// ---------------------------------------------------------------------------
// Tender: mobile money and card are taken for exact amounts, so only cash can
// be over the total and give change.
// ---------------------------------------------------------------------------

export interface TenderLine {
  method: PosTenderCode;
  amountMinor: number;
  reference?: string | null;
}

export type Settlement = { ok: true; paidMinor: number; changeMinor: number } | { ok: false; error: string };

export function settleTender(totalMinor: number, tenders: readonly TenderLine[]): Settlement {
  if (tenders.length === 0) return { ok: false, error: "Add how the customer paid." };
  if (new Set(tenders.map((t) => t.method)).size !== tenders.length) {
    return { ok: false, error: "Each payment method can only be used once in a sale." };
  }
  if (tenders.some((t) => !Number.isInteger(t.amountMinor) || t.amountMinor <= 0)) {
    return { ok: false, error: "Every payment must be more than zero." };
  }
  if (tenders.some((t) => t.method === "MOMO" && !t.reference?.trim())) {
    return { ok: false, error: "Enter the mobile money transaction ID." };
  }
  const exact = tenders.filter((t) => t.method !== "CASH").reduce((sum, t) => sum + t.amountMinor, 0);
  if (exact > totalMinor) {
    return { ok: false, error: "Mobile money and card cannot be more than the total. Only cash gives change." };
  }
  const paidMinor = tenders.reduce((sum, t) => sum + t.amountMinor, 0);
  if (paidMinor < totalMinor) return { ok: false, error: `${formatMoney(totalMinor - paidMinor)} still to pay.` };
  return { ok: true, paidMinor, changeMinor: paidMinor - totalMinor };
}

// ---------------------------------------------------------------------------
// Upload format: what the till sends when it syncs.
// ---------------------------------------------------------------------------

export const POS_MAX_ITEMS = 200;
export const POS_MAX_SALES_PER_UPLOAD = 50;
const MAX_QUANTITY_MILLI = 1_000_000; // 1,000 units or kg in one line
const MAX_AMOUNT_MINOR = 100_000_000; // GH₵1,000,000

export const posSaleUploadSchema = z.object({
  clientId: z.uuid(),
  receiptNumber: z.string().regex(RECEIPT_PATTERN),
  tillCode: z.string().regex(TILL_CODE_PATTERN),
  shiftClientId: z.uuid().nullish(),
  cashierId: z.string().min(1).max(64),
  soldAt: z.iso.datetime({ offset: true }),
  items: z
    .array(
      z.object({
        variantId: z.string().min(1).max(64),
        quantityMilli: z.number().int().positive().max(MAX_QUANTITY_MILLI),
        unitPriceMinor: z.number().int().min(0).max(MAX_AMOUNT_MINOR),
      }),
    )
    .min(1)
    .max(POS_MAX_ITEMS),
  payments: z
    .array(
      z.object({
        method: z.enum(POS_TENDERS),
        amountMinor: z.number().int().positive().max(MAX_AMOUNT_MINOR),
        reference: z.string().trim().max(60).nullish(),
      }),
    )
    .min(1)
    .max(POS_TENDERS.length),
});

export type PosSaleUpload = z.infer<typeof posSaleUploadSchema>;

export const posSyncSchema = z.object({
  sales: z.array(posSaleUploadSchema).min(1).max(POS_MAX_SALES_PER_UPLOAD),
});
