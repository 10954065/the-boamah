import {
  formatReceiptNumber,
  type PosRejectReason,
  type PosSaleResult,
  type PosSaleUpload,
  type PosShiftClose,
  type PosShiftOpen,
  type ShiftCloseResult,
  type ShiftOpenResult,
} from "@/lib/pos";
import { nextStep, type OutboxEntry, type SaleEntry, type ShiftCloseEntry, type ShiftOpenEntry, type ShiftRecord, type ShiftReport } from "@/lib/pos-outbox";
import type { ReceiptData } from "@/lib/pos-till";

/**
 * Sends the till's outbox to the shop's system, oldest first, and records
 * what came back. Storage and the network are passed in, so the same steps
 * run in the browser and in tests.
 */

/** Why a request from the till did not go through. */
export type TillFailure = "offline" | "signed-out" | "refused" | "server";

export interface SyncFailure {
  message: string;
  kind: TillFailure;
  /** The HTTP status, when the server answered. */
  status?: number;
}

/** Every answer from the till's API carries the server's clock. */
type Stamped<T> = T & { serverTime: string };

export interface OutboxApi {
  sendSales(uploads: PosSaleUpload[]): Promise<Stamped<{ results: PosSaleResult[] }>>;
  openShift(input: PosShiftOpen): Promise<Stamped<ShiftOpenResult>>;
  closeShift(input: PosShiftClose): Promise<Stamped<ShiftCloseResult>>;
}

export interface OutboxStore {
  entries(): OutboxEntry[];
  /** Changes the stored entries, reading them again first so nothing added meanwhile is lost. False when it could not be saved. */
  update(change: (entries: OutboxEntry[]) => OutboxEntry[]): boolean;
  shiftRecord(): ShiftRecord | null;
  saveShiftRecord(record: ShiftRecord): void;
  /** The shift's own sales list is no longer needed once the server has its close. */
  forgetJournal(shiftClientId: string): void;
  /** The next receipt number for a sale whose number another device had used. */
  issueReceiptSequence(tillCode: string, serverLast: number): number;
}

type RecordedSale = Extract<PosSaleResult, { status: "recorded" | "duplicate" }>;

/** What happened to one entry. */
export type EntryOutcome =
  | { kind: "sale"; receipt: ReceiptData; result: RecordedSale; printedNumber: string | null }
  | { kind: "shift-open"; shift: ShiftOpenEntry["shift"] }
  | { kind: "shift-close"; report: ShiftReport }
  | { kind: "refused"; error: string; reason: PosRejectReason | null; serverTime: string };

export interface DrainResult {
  outcomes: Map<string, EntryOutcome>;
  failure: SyncFailure | null;
}

/** Times a sale is renumbered when another device has used its receipt number. */
export const MAX_RENUMBER_ATTEMPTS = 3;
/** Upper bound on requests in one go, so a loop that makes no progress still ends. */
const MAX_STEPS = 200;

const STORAGE_FAILURE: SyncFailure = {
  message: "This device's storage is full, so the till cannot note what was sent. Free up space on the device.",
  kind: "server",
};

class DrainStopped extends Error {
  constructor(readonly failure: SyncFailure) {
    super(failure.message);
  }
}

type Describe = (error: unknown) => SyncFailure;

interface StepContext {
  store: OutboxStore;
  api: OutboxApi;
  describe: Describe;
  outcomes: Map<string, EntryOutcome>;
}

function save(store: OutboxStore, change: (entries: OutboxEntry[]) => OutboxEntry[]): void {
  if (!store.update(change)) throw new DrainStopped(STORAGE_FAILURE);
}

const without = (id: string) => (entries: OutboxEntry[]) => entries.filter((entry) => entry.id !== id);

function replaced(entry: OutboxEntry) {
  return (entries: OutboxEntry[]) => entries.map((current) => (current.id === entry.id ? entry : current));
}

function refuse<T extends OutboxEntry>(entry: T, error: string, reason: PosRejectReason | null, serverTime: string): T {
  return { ...entry, status: "refused", error, reason, refusedAt: serverTime };
}

/** The server could not take the upload as a whole (malformed or too large), as opposed to the person or the connection. */
function payloadRefused(failure: SyncFailure): boolean {
  return failure.kind === "refused" && (failure.status === 400 || failure.status === 413);
}

function renumbered(entry: SaleEntry, store: OutboxStore, lastReceiptSeq: number): SaleEntry {
  const receiptNumber = formatReceiptNumber(entry.upload.tillCode, store.issueReceiptSequence(entry.upload.tillCode, lastReceiptSeq));
  return {
    ...entry,
    upload: { ...entry.upload, receiptNumber },
    receipt: { ...entry.receipt, receiptNumber },
    renumbered: entry.renumbered + 1,
    printedNumber: entry.printedNumber ?? entry.upload.receiptNumber,
  };
}

async function sendSales(context: StepContext, batch: SaleEntry[]): Promise<void> {
  const { store, api, describe, outcomes } = context;
  let response: Awaited<ReturnType<OutboxApi["sendSales"]>>;
  try {
    response = await api.sendSales(batch.map((entry) => entry.upload));
  } catch (error) {
    const failure = describe(error);
    if (!payloadRefused(failure)) throw error;
    // One sale the server cannot take holds up the rest: send them one at a time to find it.
    if (batch.length > 1) {
      for (const entry of batch) await sendSales(context, [entry]);
      return;
    }
    const entry = batch[0]!;
    const refusedAt = new Date().toISOString();
    save(store, replaced(refuse(entry, failure.message, null, refusedAt)));
    outcomes.set(entry.id, { kind: "refused", error: failure.message, reason: null, serverTime: refusedAt });
    return;
  }

  const { results, serverTime } = response;
  const byClientId = new Map(results.map((result) => [result.clientId, result]));
  const sent = new Set<string>();
  const changed = new Map<string, OutboxEntry>();
  for (const entry of batch) {
    const result = byClientId.get(entry.upload.clientId);
    if (!result) continue;
    if (result.status !== "rejected") {
      sent.add(entry.id);
      outcomes.set(entry.id, { kind: "sale", receipt: entry.receipt, result, printedNumber: entry.printedNumber ?? null });
    } else if (result.reason === "receipt-used" && entry.renumbered < MAX_RENUMBER_ATTEMPTS) {
      // Another device used this number: take the next free one and send it again.
      changed.set(entry.id, renumbered(entry, store, result.lastReceiptSeq ?? 0));
    } else {
      const reason = result.reason ?? null;
      changed.set(entry.id, refuse(entry, result.error, reason, serverTime));
      outcomes.set(entry.id, { kind: "refused", error: result.error, reason, serverTime });
    }
  }
  // One write for the whole batch.
  save(store, (entries) => entries.filter((entry) => !sent.has(entry.id)).map((entry) => changed.get(entry.id) ?? entry));
  if (batch.some((entry) => !byClientId.has(entry.upload.clientId))) {
    throw new DrainStopped({ message: "The shop's system did not confirm every sale. They stay on the till and are sent again.", kind: "server" });
  }
}

async function openShift({ store, api, outcomes }: StepContext, entry: ShiftOpenEntry): Promise<void> {
  const result = await api.openShift(entry.input);
  if (result.status === "rejected") {
    save(store, replaced(refuse(entry, result.error, null, result.serverTime)));
    // The server says which shift is open instead.
    if (result.openShift) adoptRecord(store, { shift: result.openShift, asOf: result.serverTime });
    outcomes.set(entry.id, { kind: "refused", error: result.error, reason: null, serverTime: result.serverTime });
    return;
  }
  save(store, without(entry.id));
  adoptRecord(store, { shift: result.shift, asOf: result.serverTime });
  outcomes.set(entry.id, { kind: "shift-open", shift: result.shift });
}

async function closeShift({ store, api, outcomes }: StepContext, entry: ShiftCloseEntry): Promise<void> {
  const result = await api.closeShift(entry.input);
  if (result.status === "rejected") {
    save(store, replaced(refuse(entry, result.error, null, result.serverTime)));
    outcomes.set(entry.id, { kind: "refused", error: result.error, reason: null, serverTime: result.serverTime });
    return;
  }
  save(store, without(entry.id));
  const current = store.shiftRecord();
  if (!current?.shift || current.shift.clientId === entry.input.clientId) adoptRecord(store, { shift: null, asOf: result.serverTime });
  store.forgetJournal(entry.input.clientId);
  outcomes.set(entry.id, { kind: "shift-close", report: { shift: result.shift, summary: result.summary } });
}

/**
 * Sends everything this cashier has waiting, in order, until the outbox is
 * empty or a request fails. A failed request leaves its entries waiting;
 * an entry the server refuses is marked refused and the rest carry on.
 */
export async function drainOutbox(store: OutboxStore, api: OutboxApi, cashierId: string, describe: Describe): Promise<DrainResult> {
  const context: StepContext = { store, api, describe, outcomes: new Map() };
  for (let steps = 0; steps < MAX_STEPS; steps++) {
    const step = nextStep(store.entries(), cashierId);
    if (!step) break;
    try {
      if (step.kind === "sales") await sendSales(context, step.entries);
      else if (step.kind === "shift-open") await openShift(context, step.entry);
      else await closeShift(context, step.entry);
    } catch (error) {
      return { outcomes: context.outcomes, failure: error instanceof DrainStopped ? error.failure : describe(error) };
    }
  }
  return { outcomes: context.outcomes, failure: null };
}

/** Keeps a new answer unless the stored one is later. Answers come in order, so a tie goes to the new one. */
export function adoptRecord(store: Pick<OutboxStore, "shiftRecord" | "saveShiftRecord">, record: ShiftRecord): void {
  const current = store.shiftRecord();
  if (!current || Date.parse(record.asOf) >= Date.parse(current.asOf)) store.saveShiftRecord(record);
}
