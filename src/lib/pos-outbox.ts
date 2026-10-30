import { z } from "zod";
import {
  POS_MAX_SALES_PER_UPLOAD,
  POS_TENDERS,
  posSaleUploadSchema,
  posShiftCloseSchema,
  posShiftOpenSchema,
  summariseShift,
  type PosRejectReason,
  type PosSaleUpload,
  type PosShiftClose,
  type PosShiftOpen,
  type PosShiftView,
  type PosTenderCode,
  type ShiftSummary,
} from "@/lib/pos";
import type { ReceiptData } from "@/lib/pos-till";

/**
 * The till's outbox: everything done at the till that the shop's system has
 * not confirmed yet (shifts opened, sales, shifts closed), kept on the device
 * in the order it happened and sent in that order once there is a connection.
 * Each cashier's entries are sent only while that cashier is signed in.
 */

interface EntryBase {
  /** The entry's own id: the sale's or shift's client id, or a fresh one for a close. */
  id: string;
  /** Who made the entry, and so who has to be signed in to send it. */
  cashierId: string;
  cashierName: string;
  createdAt: string;
  /** Refused entries wait for a person to look at them; they are not sent again by themselves. */
  status: "waiting" | "refused";
  error: string | null;
  reason: PosRejectReason | null;
  /** The server's time when it refused the entry. */
  refusedAt: string | null;
}

export interface SaleEntry extends EntryBase {
  kind: "sale";
  upload: PosSaleUpload;
  receipt: ReceiptData;
  /** Times the receipt was renumbered because another device had used its number. */
  renumbered: number;
  /** The number first given to the customer, when the sale was renumbered since. */
  printedNumber?: string | null;
}

export interface ShiftOpenEntry extends EntryBase {
  kind: "shift-open";
  input: PosShiftOpen;
  shift: PosShiftView;
}

/** A shift and what its sales took: from the server, or worked out on the till while offline. */
export interface ShiftReport {
  shift: PosShiftView;
  summary: ShiftSummary;
}

export interface ShiftCloseEntry extends EntryBase {
  kind: "shift-close";
  input: PosShiftClose;
  /** The report worked out on the till when the shift was closed. */
  report: ShiftReport;
}

export type OutboxEntry = SaleEntry | ShiftOpenEntry | ShiftCloseEntry;

export const newEntryState = { status: "waiting", error: null, reason: null, refusedAt: null } as const;

// ---------------------------------------------------------------------------
// Reading entries back from storage, which may hold anything.
// ---------------------------------------------------------------------------

const tenderTotalsSchema = z.object({ CASH: z.number().int(), MOMO: z.number().int(), CARD: z.number().int() });

const shiftViewSchema = z.object({
  clientId: z.uuid(),
  tillCode: z.string(),
  cashierId: z.string(),
  cashierName: z.string(),
  openedAt: z.string(),
  openingFloatMinor: z.number().int(),
  closedAt: z.string().nullable(),
  countedMinor: tenderTotalsSchema.nullable(),
  notes: z.string().nullable(),
});

const noTotals = { CASH: 0, MOMO: 0, CARD: 0 };

// Reports saved before returns and voids existed have none of either.
const summarySchema = z.object({
  salesCount: z.number().int(),
  salesTotalMinor: z.number().int(),
  takenMinor: tenderTotalsSchema,
  refundsCount: z.number().int().default(0),
  refundedMinor: tenderTotalsSchema.default(noTotals),
  voidsCount: z.number().int().default(0),
  voidedTotalMinor: z.number().int().default(0),
  expectedMinor: tenderTotalsSchema,
});

const receiptSchema = z.custom<ReceiptData>((value) => {
  const receipt = value as Partial<ReceiptData> | null;
  return typeof receipt?.receiptNumber === "string" && Array.isArray(receipt.lines) && Array.isArray(receipt.payments) && typeof receipt.totalMinor === "number";
});

const entryBase = {
  id: z.string().min(1).max(64),
  cashierId: z.string().min(1).max(64),
  cashierName: z.string(),
  createdAt: z.string(),
  status: z.enum(["waiting", "refused"]),
  error: z.string().nullable(),
  reason: z.enum(["shift-closed", "receipt-used", "other-cashier"]).nullable(),
  refusedAt: z.string().nullable(),
};

export const outboxEntrySchema = z.discriminatedUnion("kind", [
  z.object({
    ...entryBase,
    kind: z.literal("sale"),
    upload: posSaleUploadSchema,
    receipt: receiptSchema,
    renumbered: z.number().int().min(0),
    printedNumber: z.string().nullish(),
  }),
  z.object({ ...entryBase, kind: z.literal("shift-open"), input: posShiftOpenSchema, shift: shiftViewSchema }),
  z.object({ ...entryBase, kind: z.literal("shift-close"), input: posShiftCloseSchema, report: z.object({ shift: shiftViewSchema, summary: summarySchema }) }),
]);

/**
 * The entries in stored data. Anything this version cannot read is handed
 * back untouched, so it is kept (it may be a paid sale) rather than lost.
 */
export function parseOutbox(value: unknown): { entries: OutboxEntry[]; unreadable: unknown[] } {
  if (!Array.isArray(value)) return { entries: [], unreadable: value === null || value === undefined ? [] : [value] };
  const entries: OutboxEntry[] = [];
  const unreadable: unknown[] = [];
  for (const item of value) {
    const parsed = outboxEntrySchema.safeParse(item);
    if (parsed.success) entries.push(parsed.data as OutboxEntry);
    else unreadable.push(item);
  }
  return { entries, unreadable };
}

// ---------------------------------------------------------------------------
// Which shift is open on the till.
// ---------------------------------------------------------------------------

/** What the server last said about the till's open shift, and when (by the server's clock). */
export interface ShiftRecord {
  shift: PosShiftView | null;
  asOf: string;
}

/** The later of two answers from the server. */
export function newerRecord(a: ShiftRecord | null, b: ShiftRecord | null): ShiftRecord | null {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(b.asOf) > Date.parse(a.asOf) ? b : a;
}

/**
 * The shift the till works in: what the server last said, with this
 * cashier's own openings and closings that are still on their way on top.
 * Refused entries are left out: the server has said no to them.
 */
export function effectiveShift(record: ShiftRecord | null, entries: readonly OutboxEntry[], cashierId: string): PosShiftView | null {
  let shift = record?.shift ?? null;
  for (const entry of entries) {
    if (entry.cashierId !== cashierId || entry.status !== "waiting") continue;
    if (entry.kind === "shift-open") shift = entry.shift;
    else if (entry.kind === "shift-close" && shift?.clientId === entry.input.clientId) shift = null;
  }
  return shift;
}

// ---------------------------------------------------------------------------
// What to send next.
// ---------------------------------------------------------------------------

export type OutboxStep =
  | { kind: "sales"; entries: SaleEntry[] }
  | { kind: "shift-open"; entry: ShiftOpenEntry }
  | { kind: "shift-close"; entry: ShiftCloseEntry };

/**
 * The next thing to send for this cashier, oldest first: a batch of sales,
 * or one shift opening or closing. Sales of a shift whose opening was refused
 * are held back until that is put right.
 */
export function nextStep(entries: readonly OutboxEntry[], cashierId: string): OutboxStep | null {
  const held = new Set<string>();
  const sales: SaleEntry[] = [];
  for (const entry of entries) {
    if (entry.cashierId !== cashierId) continue;
    if (entry.status === "refused") {
      if (entry.kind === "shift-open") held.add(entry.shift.clientId);
      continue;
    }
    if (entry.kind === "sale") {
      if (entry.upload.shiftClientId && held.has(entry.upload.shiftClientId)) continue;
      sales.push(entry);
      if (sales.length === POS_MAX_SALES_PER_UPLOAD) break;
      continue;
    }
    if (entry.kind === "shift-close" && held.has(entry.input.clientId)) continue;
    if (sales.length > 0) break;
    return entry.kind === "shift-open" ? { kind: "shift-open", entry } : { kind: "shift-close", entry };
  }
  return sales.length > 0 ? { kind: "sales", entries: sales } : null;
}

// ---------------------------------------------------------------------------
// The shift's own record of its sales, so a shift closed offline still gets a report.
// ---------------------------------------------------------------------------

export interface JournalSale {
  kind: "sale";
  clientId: string;
  totalMinor: number;
  changeMinor: number;
  payments: { method: PosTenderCode; amountMinor: number }[];
  /** Voided later in the shift: its money went back. */
  voided?: boolean;
}

/** Money given back from the drawer (or by mobile money or card) for a return. */
export interface JournalRefund {
  kind: "refund";
  clientId: string;
  method: PosTenderCode;
  refundMinor: number;
}

export type JournalEntry = JournalSale | JournalRefund;

const journalEntrySchema = z.union([
  z.object({ kind: z.literal("refund"), clientId: z.string(), method: z.enum(POS_TENDERS), refundMinor: z.number().int() }),
  z.object({
    // Journals kept before returns existed hold only sales, without a kind.
    kind: z.literal("sale").default("sale"),
    clientId: z.string(),
    totalMinor: z.number().int(),
    changeMinor: z.number().int(),
    payments: z.array(z.object({ method: z.enum(POS_TENDERS), amountMinor: z.number().int() })),
    voided: z.boolean().optional(),
  }),
]);

export function parseJournal(value: unknown): JournalEntry[] {
  const parsed = z.array(journalEntrySchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

export function journalSaleOf(receipt: ReceiptData, clientId: string): JournalSale {
  return {
    kind: "sale",
    clientId,
    totalMinor: receipt.totalMinor,
    changeMinor: receipt.changeMinor,
    payments: receipt.payments.map((p) => ({ method: p.method, amountMinor: p.amountMinor })),
  };
}

/** The report for a shift closed on the till, from the sales, voids and refunds the till made in it. */
export function localShiftReport(shift: PosShiftView, close: PosShiftClose, journal: readonly JournalEntry[]): ShiftReport {
  const sales = journal.filter((entry): entry is JournalSale => entry.kind === "sale");
  return {
    shift: {
      ...shift,
      closedAt: close.closedAt,
      countedMinor: { CASH: close.countedCashMinor, MOMO: close.countedMomoMinor, CARD: close.countedCardMinor },
      notes: close.notes?.trim() || null,
    },
    summary: summariseShift(
      shift.openingFloatMinor,
      sales.filter((sale) => !sale.voided),
      {
        refunds: journal.filter((entry): entry is JournalRefund => entry.kind === "refund"),
        voidedTotalsMinor: sales.filter((sale) => sale.voided).map((sale) => sale.totalMinor),
      },
    ),
  };
}
