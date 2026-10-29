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
export const POS_MAX_QUANTITY_MILLI = 1_000_000; // 1,000 units or kg in one line
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
        quantityMilli: z.number().int().positive().max(POS_MAX_QUANTITY_MILLI),
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

/** Why the server refused something from the till, when the till can act on it (for example by renumbering the receipt). */
export type PosRejectReason = "shift-closed" | "receipt-used" | "other-cashier";

/** What the server did with one uploaded sale. */
export type PosSaleResult =
  | { clientId: string; status: "recorded" | "duplicate"; saleId: string; receiptNumber: string; shortfall: boolean; priceDifference: boolean }
  | { clientId: string; status: "rejected"; error: string; reason?: PosRejectReason; lastReceiptSeq?: number };

export const posSyncSchema = z.object({
  sales: z.array(posSaleUploadSchema).min(1).max(POS_MAX_SALES_PER_UPLOAD),
});

// ---------------------------------------------------------------------------
// Shifts: opened with a cash float, closed with what the cashier counted.
// Expected amounts always come from the shift's recorded sales.
// ---------------------------------------------------------------------------

const MAX_FLOAT_MINOR = 10_000_000; // GH₵100,000
const countedAmount = z.number().int().min(0).max(MAX_AMOUNT_MINOR);

export const posShiftOpenSchema = z.object({
  clientId: z.uuid(),
  tillCode: z.string().regex(TILL_CODE_PATTERN),
  openedAt: z.iso.datetime({ offset: true }),
  openingFloatMinor: z.number().int().min(0).max(MAX_FLOAT_MINOR),
});

export type PosShiftOpen = z.infer<typeof posShiftOpenSchema>;

export const posShiftCloseSchema = z.object({
  clientId: z.uuid(),
  closedAt: z.iso.datetime({ offset: true }),
  countedCashMinor: countedAmount,
  countedMomoMinor: countedAmount,
  countedCardMinor: countedAmount,
  notes: z.string().trim().max(500).nullish(),
});

export type PosShiftClose = z.infer<typeof posShiftCloseSchema>;

export type TenderTotals = Record<PosTenderCode, number>;

/** A shift as the till sees it. */
export interface PosShiftView {
  clientId: string;
  tillCode: string;
  cashierId: string;
  cashierName: string;
  openedAt: string;
  openingFloatMinor: number;
  closedAt: string | null;
  countedMinor: TenderTotals | null;
  notes: string | null;
}

export interface ShiftSaleTotals {
  changeMinor: number;
  totalMinor: number;
  payments: readonly { method: PosTenderCode; amountMinor: number }[];
}

export interface ShiftSummary {
  salesCount: number;
  salesTotalMinor: number;
  /** Money taken per method. Cash is net of the change given back. */
  takenMinor: TenderTotals;
  /** What should be at the till at close: cash includes the opening float. */
  expectedMinor: TenderTotals;
}

export type ShiftOpenResult =
  | { status: "opened" | "duplicate"; shift: PosShiftView }
  | { status: "rejected"; error: string; openShift: PosShiftView | null };

export type ShiftCloseResult =
  | { status: "closed" | "duplicate"; shift: PosShiftView; summary: ShiftSummary }
  | { status: "rejected"; error: string };

export function summariseShift(openingFloatMinor: number, sales: readonly ShiftSaleTotals[]): ShiftSummary {
  const payments = sales.flatMap((sale) => sale.payments);
  const paidBy = (method: PosTenderCode) => payments.filter((p) => p.method === method).reduce((sum, p) => sum + p.amountMinor, 0);
  const changeMinor = sales.reduce((sum, sale) => sum + sale.changeMinor, 0);
  const takenMinor: TenderTotals = { CASH: paidBy("CASH") - changeMinor, MOMO: paidBy("MOMO"), CARD: paidBy("CARD") };
  return {
    salesCount: sales.length,
    salesTotalMinor: sales.reduce((sum, sale) => sum + sale.totalMinor, 0),
    takenMinor,
    expectedMinor: { ...takenMinor, CASH: openingFloatMinor + takenMinor.CASH },
  };
}

/** Counted minus expected for each method: below zero is money missing. */
export function countDifferences(expected: TenderTotals, counted: TenderTotals): TenderTotals {
  return { CASH: counted.CASH - expected.CASH, MOMO: counted.MOMO - expected.MOMO, CARD: counted.CARD - expected.CARD };
}
