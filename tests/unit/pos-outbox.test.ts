import { describe, expect, it } from "vitest";
import type { PosSaleResult, PosSaleUpload, PosShiftClose, PosShiftView, ShiftCloseResult, ShiftOpenResult } from "@/lib/pos";
import {
  effectiveShift,
  journalSaleOf,
  localShiftReport,
  newEntryState,
  newerRecord,
  nextStep,
  parseOutbox,
  type OutboxEntry,
  type SaleEntry,
  type ShiftCloseEntry,
  type ShiftOpenEntry,
  type ShiftRecord,
} from "@/lib/pos-outbox";
import { adoptRecord, drainOutbox, MAX_RENUMBER_ATTEMPTS, type OutboxApi, type OutboxStore } from "@/lib/pos-sync";
import type { ReceiptData } from "@/lib/pos-till";

const AMA = "cashier-ama";
const KOFI = "cashier-kofi";
const SHIFT_A = "11111111-1111-4111-8111-111111111111";
const SHIFT_B = "22222222-2222-4222-8222-222222222222";
let counter = 0;

function uuid(): string {
  counter += 1;
  return `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`;
}

function shiftView(clientId: string, cashierId = AMA, openingFloatMinor = 20_000): PosShiftView {
  return { clientId, tillCode: "T1", cashierId, cashierName: cashierId, openedAt: "2026-10-29T08:00:00.000Z", openingFloatMinor, closedAt: null, countedMinor: null, notes: null };
}

function receiptOf(upload: PosSaleUpload, totalMinor: number): ReceiptData {
  return {
    receiptNumber: upload.receiptNumber,
    soldAt: upload.soldAt,
    tillCode: upload.tillCode,
    cashierName: "Ama",
    lines: [],
    totalMinor,
    savingMinor: 0,
    payments: upload.payments.map((p) => ({ method: p.method, amountMinor: p.amountMinor, reference: p.reference ?? null })),
    paidMinor: upload.payments.reduce((sum, p) => sum + p.amountMinor, 0),
    changeMinor: upload.payments.reduce((sum, p) => sum + p.amountMinor, 0) - totalMinor,
  };
}

function saleEntry(options: { shift?: string; cashierId?: string; sequence?: number; totalMinor?: number; paidMinor?: number } = {}): SaleEntry {
  const { shift = SHIFT_A, cashierId = AMA, sequence = counter + 1, totalMinor = 1000, paidMinor = totalMinor } = options;
  const upload: PosSaleUpload = {
    clientId: uuid(),
    receiptNumber: `T1-${String(sequence).padStart(6, "0")}`,
    tillCode: "T1",
    shiftClientId: shift,
    cashierId,
    soldAt: "2026-10-29T09:00:00.000Z",
    items: [{ variantId: "variant-rice", quantityMilli: 1000, unitPriceMinor: totalMinor }],
    payments: [{ method: "CASH", amountMinor: paidMinor, reference: null }],
  };
  return { kind: "sale", id: upload.clientId, cashierId, cashierName: cashierId, createdAt: upload.soldAt, ...newEntryState, upload, receipt: receiptOf(upload, totalMinor), renumbered: 0 };
}

function openEntry(shiftId = SHIFT_A, cashierId = AMA): ShiftOpenEntry {
  const shift = shiftView(shiftId, cashierId);
  return {
    kind: "shift-open",
    id: shiftId,
    cashierId,
    cashierName: cashierId,
    createdAt: shift.openedAt,
    ...newEntryState,
    input: { clientId: shiftId, tillCode: "T1", openedAt: shift.openedAt, openingFloatMinor: shift.openingFloatMinor },
    shift,
  };
}

function closeEntry(shiftId = SHIFT_A, cashierId = AMA): ShiftCloseEntry {
  const input: PosShiftClose = { clientId: shiftId, closedAt: "2026-10-29T17:00:00.000Z", countedCashMinor: 21_000, countedMomoMinor: 0, countedCardMinor: 0, notes: null };
  return { kind: "shift-close", id: uuid(), cashierId, cashierName: cashierId, createdAt: input.closedAt, ...newEntryState, input, report: localShiftReport(shiftView(shiftId, cashierId), input, []) };
}

const refused = <T extends OutboxEntry>(entry: T): T => ({ ...entry, status: "refused", error: "No", refusedAt: "2026-10-29T10:00:00.000Z" });

describe("reading the outbox back from storage", () => {
  it("keeps every well formed entry in order", () => {
    const entries = [openEntry(), saleEntry(), closeEntry()];
    expect(parseOutbox(JSON.parse(JSON.stringify(entries)))).toEqual({ entries, unreadable: [] });
  });

  it("hands back entries it cannot read untouched, so a paid sale is never lost", () => {
    const sale = saleEntry();
    const broken = { ...saleEntry(), upload: { ...sale.upload, clientId: "not a uuid" } };
    expect(parseOutbox([sale, broken, { kind: "mystery" }, null])).toEqual({ entries: [sale], unreadable: [broken, { kind: "mystery" }, null] });
  });

  it("reads nothing stored as empty, and keeps anything else that is not a list", () => {
    expect(parseOutbox(null)).toEqual({ entries: [], unreadable: [] });
    expect(parseOutbox({ entries: [] })).toEqual({ entries: [], unreadable: [{ entries: [] }] });
  });
});

describe("the shift the till works in", () => {
  const record: ShiftRecord = { shift: shiftView(SHIFT_A), asOf: "2026-10-29T08:00:00.000Z" };

  it("takes the later of two answers from the server", () => {
    const later: ShiftRecord = { shift: null, asOf: "2026-10-29T09:00:00.000Z" };
    expect(newerRecord(record, later)).toBe(later);
    expect(newerRecord(later, record)).toBe(later);
    expect(newerRecord(null, record)).toBe(record);
    expect(newerRecord(record, null)).toBe(record);
  });

  it("keeps the stored answer when both are from the same moment", () => {
    const same: ShiftRecord = { shift: null, asOf: record.asOf };
    expect(newerRecord(record, same)).toBe(record);
  });

  it("is the server's shift when nothing is waiting", () => {
    expect(effectiveShift(record, [], AMA)?.clientId).toBe(SHIFT_A);
  });

  it("is closed by the cashier's own waiting close", () => {
    expect(effectiveShift(record, [saleEntry(), closeEntry(SHIFT_A)], AMA)).toBeNull();
  });

  it("is a shift opened on the till while offline, after closing the last one", () => {
    expect(effectiveShift(record, [closeEntry(SHIFT_A), openEntry(SHIFT_B)], AMA)?.clientId).toBe(SHIFT_B);
  });

  it("ignores other cashiers' entries and anything the server refused", () => {
    expect(effectiveShift(record, [closeEntry(SHIFT_A, KOFI)], AMA)?.clientId).toBe(SHIFT_A);
    expect(effectiveShift(null, [refused(openEntry(SHIFT_B))], AMA)).toBeNull();
  });
});

describe("what is sent next", () => {
  it("sends nothing when nothing of this cashier's is waiting", () => {
    expect(nextStep([], AMA)).toBeNull();
    expect(nextStep([saleEntry({ cashierId: KOFI })], AMA)).toBeNull();
  });

  it("opens the shift before its sales, then sends the sales together, then closes it", () => {
    const open = openEntry();
    const sales = [saleEntry(), saleEntry()];
    const close = closeEntry();
    expect(nextStep([open, ...sales, close], AMA)).toEqual({ kind: "shift-open", entry: open });
    expect(nextStep([...sales, close], AMA)).toEqual({ kind: "sales", entries: sales });
    expect(nextStep([close], AMA)).toEqual({ kind: "shift-close", entry: close });
  });

  it("sends at most 50 sales in one go", () => {
    const sales = Array.from({ length: 55 }, () => saleEntry());
    const step = nextStep(sales, AMA);
    expect(step?.kind === "sales" && step.entries).toHaveLength(50);
  });

  it("skips refused sales and holds back the sales and close of a shift the server would not open", () => {
    const skipped = refused(saleEntry({ shift: SHIFT_B }));
    const blockedOpen = refused(openEntry(SHIFT_B));
    const held = saleEntry({ shift: SHIFT_B });
    const other = saleEntry({ shift: SHIFT_A });
    expect(nextStep([skipped, blockedOpen, held, closeEntry(SHIFT_B), other], AMA)).toEqual({ kind: "sales", entries: [other] });
  });
});

describe("a shift closed on the till", () => {
  it("is reported from the sales the till made in it", () => {
    const shift = shiftView(SHIFT_A, AMA, 20_000);
    const cash = saleEntry({ totalMinor: 1500, paidMinor: 2000 });
    const close: PosShiftClose = { clientId: SHIFT_A, closedAt: "2026-10-29T17:00:00.000Z", countedCashMinor: 21_500, countedMomoMinor: 0, countedCardMinor: 0, notes: "  " };
    const report = localShiftReport(shift, close, [journalSaleOf(cash.receipt, cash.id)]);
    expect(report.shift).toMatchObject({ closedAt: close.closedAt, countedMinor: { CASH: 21_500, MOMO: 0, CARD: 0 }, notes: null });
    expect(report.summary).toMatchObject({ salesCount: 1, salesTotalMinor: 1500, expectedMinor: { CASH: 21_500, MOMO: 0, CARD: 0 } });
  });
});

// ---------------------------------------------------------------------------
// Sending, against an in-memory till and a pretend server.
// ---------------------------------------------------------------------------

const SERVER_TIME = "2026-10-29T12:00:00.000Z";

function memoryStore(initial: OutboxEntry[], record: ShiftRecord | null = null) {
  const state = { entries: initial, record, forgotten: [] as string[], lastSequence: 10, full: false, writes: 0 };
  const store: OutboxStore = {
    entries: () => state.entries,
    update: (change) => {
      if (state.full) return false;
      state.writes += 1;
      state.entries = change(state.entries);
      return true;
    },
    shiftRecord: () => state.record,
    saveShiftRecord: (next) => {
      state.record = next;
    },
    forgetJournal: (id) => state.forgotten.push(id),
    issueReceiptSequence: (_tillCode, serverLast) => {
      state.lastSequence = Math.max(state.lastSequence, serverLast) + 1;
      return state.lastSequence;
    },
  };
  return { state, store };
}

interface FakeServer {
  sales?: (upload: PosSaleUpload, attempt: number) => PosSaleResult;
  open?: () => ShiftOpenResult;
  close?: () => ShiftCloseResult;
  offline?: boolean;
}

function fakeApi(server: FakeServer) {
  const calls: string[] = [];
  const attempts = new Map<string, number>();
  const recorded = (upload: PosSaleUpload): PosSaleResult => ({
    clientId: upload.clientId,
    status: "recorded",
    saleId: `sale-${upload.clientId}`,
    receiptNumber: upload.receiptNumber,
    shortfall: false,
    priceDifference: false,
  });
  const api: OutboxApi = {
    async sendSales(uploads) {
      calls.push(`sales:${uploads.length}`);
      if (server.offline) throw new Error("offline");
      const results = uploads.map((upload) => {
        const attempt = (attempts.get(upload.clientId) ?? 0) + 1;
        attempts.set(upload.clientId, attempt);
        return server.sales ? server.sales(upload, attempt) : recorded(upload);
      });
      return { results, serverTime: SERVER_TIME };
    },
    async openShift(input) {
      calls.push("open");
      if (server.offline) throw new Error("offline");
      return { ...(server.open?.() ?? { status: "opened", shift: shiftView(input.clientId) }), serverTime: SERVER_TIME };
    },
    async closeShift(input) {
      calls.push("close");
      if (server.offline) throw new Error("offline");
      const shift = { ...shiftView(input.clientId), closedAt: input.closedAt };
      const summary = { salesCount: 0, salesTotalMinor: 0, takenMinor: { CASH: 0, MOMO: 0, CARD: 0 }, expectedMinor: { CASH: 0, MOMO: 0, CARD: 0 } };
      return { ...(server.close?.() ?? { status: "closed", shift, summary }), serverTime: SERVER_TIME };
    },
  };
  return { api, calls, recorded };
}

const describeError = () => ({ message: "No connection", kind: "offline" as const });

describe("sending the outbox", () => {
  it("sends a shift's opening, sales and close in order and empties the outbox", async () => {
    const open = openEntry(SHIFT_B);
    const sales = [saleEntry({ shift: SHIFT_B }), saleEntry({ shift: SHIFT_B })];
    const close = closeEntry(SHIFT_B);
    const { state, store } = memoryStore([open, ...sales, close]);
    const { api, calls } = fakeApi({});

    const result = await drainOutbox(store, api, AMA, describeError);

    expect(calls).toEqual(["open", "sales:2", "close"]);
    expect(result.failure).toBeNull();
    expect(state.entries).toEqual([]);
    expect([...result.outcomes.values()].map((o) => o.kind)).toEqual(["shift-open", "sale", "sale", "shift-close"]);
    expect(state.record).toEqual({ shift: null, asOf: SERVER_TIME });
    expect(state.forgotten).toEqual([SHIFT_B]);
  });

  it("leaves other cashiers' entries for them", async () => {
    const kofi = saleEntry({ cashierId: KOFI });
    const { state, store } = memoryStore([kofi, saleEntry()]);
    const { api } = fakeApi({});
    await drainOutbox(store, api, AMA, describeError);
    expect(state.entries).toEqual([kofi]);
  });

  it("stops at a lost connection and keeps everything waiting", async () => {
    const entries = [saleEntry(), closeEntry()];
    const { state, store } = memoryStore(entries);
    const { api, calls } = fakeApi({ offline: true });

    const result = await drainOutbox(store, api, AMA, describeError);

    expect(result.failure).toEqual({ message: "No connection", kind: "offline" });
    expect(calls).toEqual(["sales:1"]);
    expect(state.entries).toEqual(entries);
  });

  it("gives a sale the next free receipt number when another device used its number", async () => {
    const sale = saleEntry({ sequence: 5 });
    const { state, store } = memoryStore([sale]);
    const { api, recorded } = fakeApi({
      sales: (upload, attempt) =>
        attempt === 1 ? { clientId: upload.clientId, status: "rejected", error: "Used", reason: "receipt-used", lastReceiptSeq: 40 } : recorded(upload),
    });

    const result = await drainOutbox(store, api, AMA, describeError);

    const outcome = result.outcomes.get(sale.id);
    expect(outcome?.kind === "sale" && outcome.receipt.receiptNumber).toBe("T1-000041");
    expect(outcome?.kind === "sale" && outcome.result.receiptNumber).toBe("T1-000041");
    // The customer may already hold a receipt with the first number.
    expect(outcome?.kind === "sale" && outcome.printedNumber).toBe("T1-000005");
    expect(state.entries).toEqual([]);
  });

  it("stops renumbering after a few tries and leaves the sale for a manager", async () => {
    const sale = saleEntry();
    const { state, store } = memoryStore([sale]);
    const { api } = fakeApi({ sales: (upload) => ({ clientId: upload.clientId, status: "rejected", error: "Used", reason: "receipt-used", lastReceiptSeq: 1 }) });

    await drainOutbox(store, api, AMA, describeError);

    expect(state.entries).toHaveLength(1);
    expect(state.entries[0]).toMatchObject({ status: "refused", error: "Used", reason: "receipt-used", refusedAt: SERVER_TIME, renumbered: MAX_RENUMBER_ATTEMPTS });
  });

  it("marks a refused sale for a manager and carries on with the rest", async () => {
    const bad = saleEntry();
    const good = saleEntry();
    const { state, store } = memoryStore([bad, good]);
    const { api, recorded } = fakeApi({
      sales: (upload) =>
        upload.clientId === bad.upload.clientId ? { clientId: upload.clientId, status: "rejected", error: "Shift closed", reason: "shift-closed" } : recorded(upload),
    });

    const result = await drainOutbox(store, api, AMA, describeError);

    expect(result.outcomes.get(bad.id)).toEqual({ kind: "refused", error: "Shift closed", reason: "shift-closed", serverTime: SERVER_TIME });
    expect(result.outcomes.get(good.id)?.kind).toBe("sale");
    expect(state.entries).toEqual([{ ...bad, status: "refused", error: "Shift closed", reason: "shift-closed", refusedAt: SERVER_TIME }]);
  });

  it("keeps the shift the server says is open when it refuses an opening, and holds that shift's sales", async () => {
    const open = openEntry(SHIFT_B);
    const held = saleEntry({ shift: SHIFT_B });
    const someoneElse = shiftView(SHIFT_A, KOFI);
    const { state, store } = memoryStore([open, held]);
    const { api, calls } = fakeApi({ open: () => ({ status: "rejected", error: "Kofi's shift is still open", openShift: someoneElse }) });

    const result = await drainOutbox(store, api, AMA, describeError);

    expect(calls).toEqual(["open"]);
    expect(result.outcomes.get(open.id)).toMatchObject({ kind: "refused", error: "Kofi's shift is still open" });
    expect(state.record).toEqual({ shift: someoneElse, asOf: SERVER_TIME });
    expect(state.entries.map((e) => [e.id, e.status])).toEqual([
      [open.id, "refused"],
      [held.id, "waiting"],
    ]);
  });

  it("treats a sale the server did not answer for as not sent", async () => {
    const sale = saleEntry();
    const { state, store } = memoryStore([sale]);
    const { api } = fakeApi({});
    const silent: OutboxApi = { ...api, sendSales: async () => ({ results: [], serverTime: SERVER_TIME }) };

    const result = await drainOutbox(store, silent, AMA, describeError);

    expect(result.failure?.kind).toBe("server");
    expect(state.entries).toEqual([sale]);
  });

  it("leaves the stored shift alone when a close for another shift goes through", async () => {
    const current: ShiftRecord = { shift: shiftView(SHIFT_B), asOf: "2026-10-29T13:00:00.000Z" };
    const { state, store } = memoryStore([closeEntry(SHIFT_A)], current);
    const { api } = fakeApi({});
    await drainOutbox(store, api, AMA, describeError);
    expect(state.record).toBe(current);
  });

  it("records a whole batch with one write to the device", async () => {
    const { state, store } = memoryStore([saleEntry(), saleEntry(), saleEntry()]);
    const { api } = fakeApi({});
    await drainOutbox(store, api, AMA, describeError);
    expect(state.entries).toEqual([]);
    expect(state.writes).toBe(1);
  });

  describe("when the server will not take an upload as a whole", () => {
    class HttpError extends Error {
      constructor(readonly status: number) {
        super(`HTTP ${status}`);
      }
    }
    const describeHttp = (error: unknown) =>
      error instanceof HttpError ? { message: "Not in the expected format", kind: "refused" as const, status: error.status } : describeError();

    it("sends the batch one sale at a time and leaves only the bad sale for a manager", async () => {
      const good = [saleEntry(), saleEntry()];
      const bad = saleEntry();
      const { state, store } = memoryStore([good[0]!, bad, good[1]!]);
      const { api, recorded } = fakeApi({});
      const picky: OutboxApi = {
        ...api,
        async sendSales(uploads) {
          if (uploads.some((upload) => upload.clientId === bad.upload.clientId)) throw new HttpError(400);
          return { results: uploads.map(recorded), serverTime: SERVER_TIME };
        },
      };

      const result = await drainOutbox(store, picky, AMA, describeHttp);

      expect(result.failure).toBeNull();
      expect(state.entries).toHaveLength(1);
      expect(state.entries[0]).toMatchObject({ id: bad.id, status: "refused", error: "Not in the expected format" });
      expect(good.every((entry) => result.outcomes.get(entry.id)?.kind === "sale")).toBe(true);
    });

    it("keeps everything waiting when the refusal is about the person, not the sales", async () => {
      const entries = [saleEntry(), saleEntry()];
      const { state, store } = memoryStore(entries);
      const { api } = fakeApi({});
      const forbidden: OutboxApi = {
        ...api,
        sendSales: async () => {
          throw new HttpError(403);
        },
      };

      const result = await drainOutbox(store, forbidden, AMA, describeHttp);

      expect(result.failure).toMatchObject({ kind: "refused", status: 403 });
      expect(state.entries).toEqual(entries);
    });
  });

  it("stops when the device cannot note what was sent, so nothing is sent over and over", async () => {
    const sale = saleEntry();
    const { state, store } = memoryStore([sale]);
    state.full = true;
    const { api, calls } = fakeApi({});

    const result = await drainOutbox(store, api, AMA, describeError);

    expect(calls).toEqual(["sales:1"]);
    expect(result.failure?.message).toMatch(/storage is full/);
    expect(state.entries).toEqual([sale]);
  });

  it("keeps a newer stored answer over an older one", () => {
    const stored: ShiftRecord = { shift: shiftView(SHIFT_A), asOf: "2026-10-29T13:00:00.000Z" };
    const { state, store } = memoryStore([], stored);
    adoptRecord(store, { shift: null, asOf: "2026-10-29T12:00:00.000Z" });
    expect(state.record).toBe(stored);
    adoptRecord(store, { shift: null, asOf: "2026-10-29T14:00:00.000Z" });
    expect(state.record).toEqual({ shift: null, asOf: "2026-10-29T14:00:00.000Z" });
  });
});
