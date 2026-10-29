import type { PosShiftView } from "@/lib/pos";
import { parseJournal, parseOutbox, type JournalSale, type OutboxEntry, type ShiftRecord } from "@/lib/pos-outbox";
import type { ReceiptData } from "@/lib/pos-till";

/**
 * What the till keeps on the device itself: its receipt counter, the outbox
 * of things the server has not confirmed yet, the open shift, the last
 * receipt (for a reprint) and the printer settings. Storage can be
 * unavailable (private windows), so every read falls back; writes that matter
 * report whether they were saved.
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
// The outbox, what the server last said about the open shift, and each
// shift's own list of sales. Screens follow these through subscribeToTill.
// ---------------------------------------------------------------------------

const listeners = new Set<() => void>();
const parsedCache = new Map<string, { raw: string | null; value: unknown }>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** Calls back when the till's stored data changes, here or in another tab. */
export function subscribeToTill(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith(`${PREFIX}.`)) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Reads and parses a key, returning the same object while the stored text is unchanged. */
function readParsed<T>(key: string, parse: (value: unknown) => T): T {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(`${PREFIX}.${key}`);
  } catch {
    // Storage blocked: nothing stored.
  }
  const cached = parsedCache.get(key);
  if (cached && cached.raw === raw) return cached.value as T;
  let value: T;
  try {
    value = parse(raw === null ? null : (JSON.parse(raw) as unknown));
  } catch {
    value = parse(null);
  }
  parsedCache.set(key, { raw, value });
  return value;
}

/** Writes a key and tells the screens. False when the device's storage is full or blocked. */
function writeChecked(key: string, value: unknown): boolean {
  try {
    if (value === null) window.localStorage.removeItem(`${PREFIX}.${key}`);
    else window.localStorage.setItem(`${PREFIX}.${key}`, JSON.stringify(value));
    return true;
  } catch {
    return false;
  } finally {
    notify();
  }
}

const outboxKey = (tillCode: string) => `${tillCode}.outbox`;

function parseStoredOutbox(value: unknown): { entries: OutboxEntry[]; unreadable: unknown[] } {
  const parsed = parseOutbox(value);
  if (parsed.unreadable.length > 0) console.error(`[till] ${parsed.unreadable.length} stored outbox entries could not be read; they are kept`);
  return parsed;
}

/** Everything on this till that the shop's system has not confirmed yet, oldest first. */
export function loadOutbox(tillCode: string): OutboxEntry[] {
  return readParsed(outboxKey(tillCode), parseStoredOutbox).entries;
}

/** Stored entries this version of the till cannot read. They are kept, never sent or dropped. */
export function unreadableCount(tillCode: string): number {
  return readParsed(outboxKey(tillCode), parseStoredOutbox).unreadable.length;
}

/** Changes the outbox, keeping anything unreadable as it was. False when it could not be saved (storage full). */
export function updateOutbox(tillCode: string, change: (entries: OutboxEntry[]) => OutboxEntry[]): boolean {
  const { entries, unreadable } = readParsed(outboxKey(tillCode), parseStoredOutbox);
  const next = [...change(entries), ...unreadable];
  return writeChecked(outboxKey(tillCode), next.length > 0 ? next : null);
}

export function addToOutbox(tillCode: string, entry: OutboxEntry): boolean {
  return updateOutbox(tillCode, (entries) => [...entries.filter((e) => e.id !== entry.id), entry]);
}

export function removeFromOutbox(tillCode: string, id: string): void {
  updateOutbox(tillCode, (entries) => entries.filter((entry) => entry.id !== id));
}

const recordKey = (tillCode: string) => `${tillCode}.shift`;

function parseRecord(value: unknown): ShiftRecord | null {
  const record = value as Partial<ShiftRecord> | null;
  if (!record || typeof record.asOf !== "string" || Number.isNaN(Date.parse(record.asOf))) return null;
  const shift = record.shift as Partial<PosShiftView> | null | undefined;
  if (shift !== null && (typeof shift?.clientId !== "string" || typeof shift.cashierId !== "string")) return null;
  return record as ShiftRecord;
}

/** What the server last said about the till's open shift. */
export function loadShiftRecord(tillCode: string): ShiftRecord | null {
  return readParsed(recordKey(tillCode), parseRecord);
}

export function saveShiftRecord(tillCode: string, record: ShiftRecord): void {
  writeChecked(recordKey(tillCode), record);
}

const journalKey = (tillCode: string) => `${tillCode}.journal`;

function parseJournals(value: unknown): Record<string, JournalSale[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([shiftId, sales]) => [shiftId, parseJournal(sales)]));
}

function loadJournals(tillCode: string): Record<string, JournalSale[]> {
  return readParsed(journalKey(tillCode), parseJournals);
}

/** The sales this till made in a shift, for a report worked out offline. */
export function journalFor(tillCode: string, shiftClientId: string): JournalSale[] {
  return loadJournals(tillCode)[shiftClientId] ?? [];
}

export function addToJournal(tillCode: string, shiftClientId: string, sale: JournalSale): void {
  const journals = loadJournals(tillCode);
  const sales = (journals[shiftClientId] ?? []).filter((s) => s.clientId !== sale.clientId);
  writeChecked(journalKey(tillCode), { ...journals, [shiftClientId]: [...sales, sale] });
}

export function removeFromJournal(tillCode: string, shiftClientId: string, saleClientId: string): void {
  const journals = loadJournals(tillCode);
  const sales = journals[shiftClientId];
  if (!sales) return;
  writeChecked(journalKey(tillCode), { ...journals, [shiftClientId]: sales.filter((s) => s.clientId !== saleClientId) });
}

/** Keeps only the given shifts' lists. */
export function keepJournals(tillCode: string, shiftClientIds: readonly string[]): void {
  const journals = loadJournals(tillCode);
  const kept = Object.fromEntries(Object.entries(journals).filter(([shiftId]) => shiftClientIds.includes(shiftId)));
  if (Object.keys(kept).length !== Object.keys(journals).length) writeChecked(journalKey(tillCode), Object.keys(kept).length > 0 ? kept : null);
}

// ---------------------------------------------------------------------------
// Sales whose receipt number changed after the customer had their receipt,
// and when the till last heard from the shop's system.
// ---------------------------------------------------------------------------

export interface RenumberNotice {
  id: string;
  printed: string;
  recorded: string;
}

const noticesKey = (tillCode: string) => `${tillCode}.renumbered`;
const MAX_NOTICES = 20;

function parseNotices(value: unknown): RenumberNotice[] {
  if (!Array.isArray(value)) return [];
  return value.filter((n): n is RenumberNotice => typeof n?.id === "string" && typeof n.printed === "string" && typeof n.recorded === "string");
}

export function loadNotices(tillCode: string): RenumberNotice[] {
  return readParsed(noticesKey(tillCode), parseNotices);
}

export function addNotices(tillCode: string, notices: readonly RenumberNotice[]): void {
  if (notices.length === 0) return;
  const ids = new Set(notices.map((n) => n.id));
  writeChecked(noticesKey(tillCode), [...loadNotices(tillCode).filter((n) => !ids.has(n.id)), ...notices].slice(-MAX_NOTICES));
}

export function dismissNotice(tillCode: string, id: string): void {
  const kept = loadNotices(tillCode).filter((n) => n.id !== id);
  writeChecked(noticesKey(tillCode), kept.length > 0 ? kept : null);
}

const contactKey = (tillCode: string) => `${tillCode}.lastContact`;

function parseTime(value: unknown): string | null {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
}

/** When the shop's system last answered this till (by its clock). */
export function loadLastContact(tillCode: string): string | null {
  return readParsed(contactKey(tillCode), parseTime);
}

export function noteContact(tillCode: string, serverTime: string): void {
  const last = loadLastContact(tillCode);
  if (parseTime(serverTime) && (!last || Date.parse(serverTime) > Date.parse(last))) writeChecked(contactKey(tillCode), serverTime);
}

// ---------------------------------------------------------------------------
// The last receipt printed.
// ---------------------------------------------------------------------------

function isReceipt(value: unknown): value is ReceiptData {
  const receipt = value as Partial<ReceiptData> | null;
  return typeof receipt?.receiptNumber === "string" && Array.isArray(receipt.lines) && Array.isArray(receipt.payments);
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
