import { posSaleUploadSchema, type PosSaleUpload } from "@/lib/pos";
import type { ReceiptData } from "@/lib/pos-till";

/**
 * What the till keeps on the device itself: its receipt counter, a sale that
 * has not reached the server yet, the last receipt (for a reprint) and the
 * printer settings. Storage can be unavailable (private windows), so every
 * read falls back and every write is best effort.
 */

const PREFIX = "boamah.till";

function read(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(`${PREFIX}.${key}`);
    return raw === null ? null : (JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null) window.localStorage.removeItem(`${PREFIX}.${key}`);
    else window.localStorage.setItem(`${PREFIX}.${key}`, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the till keeps working from memory.
  }
}

// ---------------------------------------------------------------------------
// Receipt numbers continue from the highest one seen here or on the server.
// ---------------------------------------------------------------------------

const issuedInMemory = new Map<string, number>();

function lastIssued(tillCode: string): number {
  const stored = read(`${tillCode}.lastReceipt`);
  return Math.max(typeof stored === "number" && Number.isInteger(stored) ? stored : 0, issuedInMemory.get(tillCode) ?? 0);
}

export function issueReceiptSequence(tillCode: string, serverLast: number): number {
  const next = Math.max(lastIssued(tillCode), serverLast) + 1;
  issuedInMemory.set(tillCode, next);
  write(`${tillCode}.lastReceipt`, next);
  return next;
}

/** Gives a number back when the server refused that sale, so receipts do not skip. */
export function releaseReceiptSequence(tillCode: string, sequence: number): void {
  if (lastIssued(tillCode) !== sequence) return;
  issuedInMemory.set(tillCode, sequence - 1);
  write(`${tillCode}.lastReceipt`, sequence - 1);
}

// ---------------------------------------------------------------------------
// A paid sale waiting for the server, and the last receipt printed.
// ---------------------------------------------------------------------------

export interface PendingSale {
  upload: PosSaleUpload;
  receipt: ReceiptData;
}

function isReceipt(value: unknown): value is ReceiptData {
  const receipt = value as Partial<ReceiptData> | null;
  return typeof receipt?.receiptNumber === "string" && Array.isArray(receipt.lines) && Array.isArray(receipt.payments);
}

const pendingKey = (tillCode: string, cashierId: string) => `${tillCode}.pendingSale.${cashierId}`;

function asPendingSale(value: unknown): PendingSale | null {
  const sale = value as Partial<PendingSale> | null;
  if (!sale || !posSaleUploadSchema.safeParse(sale.upload).success || !isReceipt(sale.receipt)) return null;
  return sale as PendingSale;
}

/** The cashier's own sale that has not reached the server. Each cashier has their own. */
export function loadPendingSale(tillCode: string, cashierId: string): PendingSale | null {
  return asPendingSale(read(pendingKey(tillCode, cashierId)));
}

export function savePendingSale(tillCode: string, cashierId: string, sale: PendingSale | null): void {
  write(pendingKey(tillCode, cashierId), sale);
}

/** Unsent sales other cashiers left on this device; only they can send them. */
export function otherCashiersPendingSales(tillCode: string, cashierId: string): ReceiptData[] {
  const prefix = `${PREFIX}.${tillCode}.pendingSale.`;
  try {
    return Object.keys(window.localStorage)
      .filter((key) => key.startsWith(prefix) && key !== `${PREFIX}.${pendingKey(tillCode, cashierId)}`)
      .map((key) => asPendingSale(read(key.slice(PREFIX.length + 1)))?.receipt)
      .filter((receipt): receipt is ReceiptData => receipt !== undefined);
  } catch {
    return [];
  }
}

export function loadLastReceipt(tillCode: string): ReceiptData | null {
  const value = read(`${tillCode}.lastReceiptCopy`);
  return isReceipt(value) ? value : null;
}

/** Kept for reprints during the shift, and cleared when it closes. */
export function saveLastReceipt(tillCode: string, receipt: ReceiptData | null): void {
  write(`${tillCode}.lastReceiptCopy`, receipt);
}

// ---------------------------------------------------------------------------
// Printer settings for this device.
// ---------------------------------------------------------------------------

export type PaperWidth = "80" | "58";

export interface TillPrefs {
  paper: PaperWidth;
  autoPrint: boolean;
}

export const DEFAULT_PREFS: TillPrefs = { paper: "80", autoPrint: false };

export function loadPrefs(): TillPrefs {
  const value = read("prefs") as Partial<TillPrefs> | null;
  return {
    paper: value?.paper === "58" ? "58" : "80",
    autoPrint: value?.autoPrint === true,
  };
}

export function savePrefs(prefs: TillPrefs): void {
  write("prefs", prefs);
}
