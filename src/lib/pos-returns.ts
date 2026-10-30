import { z } from "zod";
import { formatReceiptNumber, POS_MAX_ITEMS, POS_MAX_QUANTITY_MILLI, POS_TENDERS, TILL_CODE_PATTERN, type PosTenderCode, type TenderLine } from "@/lib/pos";
import { outboxEntrySchema } from "@/lib/pos-outbox";
import type { ReceiptData } from "@/lib/pos-till";
import { formatQuantity, lineTotalMinor, MILLI, UNIT_INFO, type SellingUnitCode } from "@/lib/quantity";

/**
 * Voids and returns at the till, shared by the till and the server. Both need
 * the internet and a manager. A void cancels a sale of the shift open now:
 * the money goes straight back and the goods go back on the shelf. A return
 * takes goods back from any earlier sale and pays for them out of the shift
 * open now.
 */

// ---------------------------------------------------------------------------
// What the till sends.
// ---------------------------------------------------------------------------

/** A manager's own sign in details, typed on the till to approve something. Never stored. */
export const managerApprovalSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(128),
});

export type ManagerApproval = z.infer<typeof managerApprovalSchema>;

const reasonSchema = z.string().trim().min(3).max(200);

export const VOID_REASONS = ["Rung up by mistake", "Customer changed their mind", "Payment did not go through"] as const;
export const RETURN_REASONS = ["Damaged or faulty", "Past its date", "Wrong item", "Customer changed their mind"] as const;

export const posVoidSchema = z.object({
  saleId: z.string().min(1).max(64),
  /** The shift open on the till now; only its own sales can be voided. */
  shiftClientId: z.uuid(),
  reason: reasonSchema,
  approval: managerApprovalSchema.nullish(),
});

export type PosVoidInput = z.infer<typeof posVoidSchema>;

export const posReturnSchema = z.object({
  clientId: z.uuid(),
  saleId: z.string().min(1).max(64),
  tillCode: z.string().regex(TILL_CODE_PATTERN),
  /** The shift the refund is paid out of. */
  shiftClientId: z.uuid(),
  items: z
    .array(
      z.object({
        saleItemId: z.string().min(1).max(64),
        quantityMilli: z.number().int().positive().max(POS_MAX_QUANTITY_MILLI),
        restock: z.boolean(),
      }),
    )
    .min(1)
    .max(POS_MAX_ITEMS),
  method: z.enum(POS_TENDERS),
  reference: z.string().trim().max(60).nullish(),
  reason: reasonSchema,
  approval: managerApprovalSchema.nullish(),
});

export type PosReturnInput = z.infer<typeof posReturnSchema>;

/** Something the shop's system refused, removed from a till for good: the shop keeps a record of it. */
export const posRemovalSchema = z.object({
  tillCode: z.string().regex(TILL_CODE_PATTERN),
  entry: outboxEntrySchema,
  reason: reasonSchema,
  approval: managerApprovalSchema.nullish(),
});

export type PosRemovalInput = z.infer<typeof posRemovalSchema>;

// ---------------------------------------------------------------------------
// What the server sends back: a recorded sale with its voids and returns.
// ---------------------------------------------------------------------------

export interface PosSaleLineRecord {
  /** The sale line's id, which a return names. */
  id: string;
  productName: string;
  variantName: string;
  unit: SellingUnitCode;
  quantityMilli: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
  returnedMilli: number;
  refundedMinor: number;
}

export interface PosRefundLine {
  saleItemId: string;
  productName: string;
  variantName: string;
  unit: SellingUnitCode;
  quantityMilli: number;
  refundMinor: number;
  restocked: boolean;
}

export interface PosRefundRecord {
  id: string;
  clientId: string;
  /** Printed on the refund slip, e.g. RF-000012. */
  number: string;
  createdAt: string;
  /** The receipt of the sale the goods came from. */
  receiptNumber: string;
  tillCode: string;
  cashierName: string;
  approvedByName: string;
  reason: string;
  method: PosTenderCode;
  reference: string | null;
  refundMinor: number;
  lines: PosRefundLine[];
}

export interface PosSaleRecord {
  id: string;
  clientId: string;
  receiptNumber: string;
  tillCode: string;
  cashierName: string;
  soldAt: string;
  shiftClientId: string | null;
  /** The sale's shift is still open. */
  shiftOpen: boolean;
  status: "COMPLETED" | "VOIDED";
  totalMinor: number;
  paidMinor: number;
  changeMinor: number;
  payments: TenderLine[];
  lines: PosSaleLineRecord[];
  voided: { at: string; byName: string | null; reason: string | null } | null;
  refunds: PosRefundRecord[];
}

export type PosVoidResult = { status: "voided" | "duplicate"; sale: PosSaleRecord } | { status: "rejected"; error: string };

export type PosReturnResult = { status: "recorded" | "duplicate"; refund: PosRefundRecord; sale: PosSaleRecord } | { status: "rejected"; error: string };

export type PosRemovalResult = { status: "recorded" } | { status: "rejected"; error: string };

// ---------------------------------------------------------------------------
// Rules.
// ---------------------------------------------------------------------------

const REFUND_DIGITS = 6;

export function formatRefundNumber(sequence: number): string {
  return `RF-${String(sequence).padStart(REFUND_DIGITS, "0")}`;
}

/** What staff type to find a receipt: "231" on till T1, "T1-231" or "T1-000231". Null when it cannot be one. */
export function receiptNumberFrom(text: string, tillCode: string): string | null {
  const cleaned = text.trim().toUpperCase().replace(/\s+/g, "");
  const digits = /^\d{1,6}$/.test(cleaned) ? { code: tillCode, sequence: Number(cleaned) } : null;
  const full = /^([A-Z][A-Z0-9]{0,3})-(\d{1,6})$/.exec(cleaned);
  const parts = digits ?? (full ? { code: full[1]!, sequence: Number(full[2]) } : null);
  if (!parts || parts.sequence < 1 || !TILL_CODE_PATTERN.test(parts.code)) return null;
  return formatReceiptNumber(parts.code, parts.sequence);
}

export function returnableMilli(line: Pick<PosSaleLineRecord, "quantityMilli" | "returnedMilli">): number {
  return line.quantityMilli - line.returnedMilli;
}

type RefundableLine = Pick<PosSaleLineRecord, "quantityMilli" | "returnedMilli" | "unitPriceMinor" | "lineTotalMinor" | "refundedMinor">;

/**
 * What returning part of a line gives back: the price charged for that
 * quantity. Returning the last of a line gives back exactly what is left of
 * its total, so the refunds of a line always add up to what was paid for it.
 */
export function refundForLine(line: RefundableLine, quantityMilli: number): number {
  const left = line.lineTotalMinor - line.refundedMinor;
  if (quantityMilli >= returnableMilli(line)) return left;
  return Math.min(lineTotalMinor(line.unitPriceMinor, quantityMilli), left);
}

/** Why this quantity of the line cannot be returned, or null when it can. */
export function returnQuantityProblem(line: Pick<PosSaleLineRecord, "productName" | "unit" | "quantityMilli" | "returnedMilli">, quantityMilli: number): string | null {
  const left = returnableMilli(line);
  if (left <= 0) return `${line.productName} has already been returned.`;
  if (!Number.isInteger(quantityMilli) || quantityMilli <= 0) return `Enter how much ${line.productName} is coming back.`;
  if (!UNIT_INFO[line.unit].divisible && quantityMilli % MILLI !== 0) return `${line.productName} comes back in whole ${UNIT_INFO[line.unit].plural}.`;
  if (quantityMilli > left) return `Only ${formatQuantity(left, line.unit)} of ${line.productName} can still be returned.`;
  return null;
}

/** Why the refund cannot be paid this way, or null when it can. */
export function refundMethodProblem(method: PosTenderCode, reference: string | null | undefined): string | null {
  return method === "MOMO" && !reference?.trim() ? "Enter the mobile money transaction ID of the refund." : null;
}

export function saleReturnState(record: Pick<PosSaleRecord, "lines">): "none" | "part" | "all" {
  if (record.lines.every((line) => line.returnedMilli === 0)) return "none";
  return record.lines.every((line) => returnableMilli(line) <= 0) ? "all" : "part";
}

/** What decides whether a sale can be voided. */
export interface VoidCheck {
  status: "COMPLETED" | "VOIDED";
  /** Some of it has been returned. */
  returned: boolean;
  shiftOpen: boolean;
  shiftClientId: string | null;
}

export function voidCheckOf(record: PosSaleRecord): VoidCheck {
  return { status: record.status, returned: record.refunds.length > 0, shiftOpen: record.shiftOpen, shiftClientId: record.shiftClientId };
}

/** Why the sale cannot be voided in the shift open on the till, or null when it can. */
export function voidProblem(sale: VoidCheck, shiftClientId: string): string | null {
  if (sale.status === "VOIDED") return "This sale has already been voided.";
  if (sale.returned) return "Items from this sale have been returned. Return the rest instead of voiding it.";
  if (!sale.shiftOpen || sale.shiftClientId !== shiftClientId) return "Only sales from the shift open now can be voided. For an earlier sale, return the items instead.";
  return null;
}

/** Why nothing can be returned from the sale, or null when something can. */
export function returnProblem(record: Pick<PosSaleRecord, "status" | "lines">): string | null {
  if (record.status === "VOIDED") return "This sale was voided, so there is nothing to return.";
  if (saleReturnState(record) === "all") return "Everything from this sale has already been returned.";
  return null;
}

/** The sale as a receipt, for printing a copy. */
export function receiptForRecord(record: PosSaleRecord): ReceiptData {
  return {
    receiptNumber: record.receiptNumber,
    soldAt: record.soldAt,
    tillCode: record.tillCode,
    cashierName: record.cashierName,
    lines: record.lines.map((line) => ({
      name: line.productName,
      detail: line.variantName,
      unit: line.unit,
      quantityMilli: line.quantityMilli,
      unitPriceMinor: line.unitPriceMinor,
      lineTotalMinor: line.lineTotalMinor,
      savingMinor: 0,
    })),
    totalMinor: record.totalMinor,
    savingMinor: 0,
    payments: record.payments,
    paidMinor: record.paidMinor,
    changeMinor: record.changeMinor,
  };
}
