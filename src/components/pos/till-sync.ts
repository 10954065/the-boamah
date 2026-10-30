"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { OutboxEntry, ShiftRecord } from "@/lib/pos-outbox";
import type { HeldSale } from "@/lib/pos-till";
import { adoptRecord, drainOutbox, type EntryOutcome, type OutboxApi, type OutboxStore, type SyncFailure } from "@/lib/pos-sync";
import { failureOf, tillApi } from "./till-api";
import {
  addNotices,
  dismissNotice,
  issueReceiptSequence,
  keepJournals,
  loadHeldSales,
  loadLastContact,
  loadNotices,
  loadOutbox,
  loadShiftRecord,
  noteContact,
  saveShiftRecord,
  subscribeToTill,
  unreadableCount,
  updateOutbox,
  type RenumberNotice,
} from "./till-storage";

/**
 * Sends the outbox in the background: when the till opens, when the
 * connection comes back, every half minute while something is waiting, and
 * straight after each sale. One send runs at a time, across tabs too.
 */

/** How often the till tries again while something is waiting. */
const RETRY_MS = 30_000;
/** How long the till waits for the shop's system, with the customer or cashier watching, before carrying on without it. */
export const ANSWER_WAIT_MS = 8_000;
export const STORAGE_FULL = "This device's storage is full, so the till cannot save this. Free up space on the device, then try again.";
const NO_ENTRIES: OutboxEntry[] = [];
const NO_NOTICES: RenumberNotice[] = [];
const NO_HELD: HeldSale[] = [];

/** The shift an entry belongs to. */
export function shiftOf(entry: OutboxEntry): string | null {
  if (entry.kind === "sale") return entry.upload.shiftClientId ?? null;
  return entry.kind === "shift-open" ? entry.shift.clientId : entry.input.clientId;
}

/** The till's API, noting each answer as a sign the till is in touch with the shop's system. */
function apiFor(tillCode: string): OutboxApi {
  const noted = <T extends { serverTime: string }>(answer: T): T => {
    noteContact(tillCode, answer.serverTime);
    return answer;
  };
  return {
    sendSales: (uploads) => tillApi.sendSales(uploads).then(noted),
    openShift: (input) => tillApi.openShift(input).then(noted),
    closeShift: (input) => tillApi.closeShift(input).then(noted),
  };
}

function storeFor(tillCode: string): OutboxStore {
  return {
    entries: () => loadOutbox(tillCode),
    update: (change) => updateOutbox(tillCode, change),
    shiftRecord: () => loadShiftRecord(tillCode),
    saveShiftRecord: (record) => saveShiftRecord(tillCode, record),
    forgetJournal: (shiftClientId) => {
      const current = loadShiftRecord(tillCode)?.shift?.clientId ?? null;
      tidyJournals(tillCode, current === shiftClientId ? null : current, shiftClientId);
    },
    issueReceiptSequence,
  };
}

/**
 * Keeps the sales lists of the shift on screen and of shifts with entries
 * still waiting; the rest belong to shifts already closed.
 */
export function tidyJournals(tillCode: string, currentShift: string | null, closedShift?: string): void {
  const inUse = [...loadOutbox(tillCode).map(shiftOf), currentShift];
  keepJournals(
    tillCode,
    inUse.filter((id): id is string => id !== null && id !== closedShift),
  );
}

// ---------------------------------------------------------------------------
// The state of sending, for the top bar.
// ---------------------------------------------------------------------------

export interface SyncState {
  syncing: boolean;
  failure: SyncFailure | null;
  lastAttemptAt: string | null;
}

let syncState: SyncState = { syncing: false, failure: null, lastAttemptAt: null };
const syncListeners = new Set<() => void>();

function setSyncState(next: Partial<SyncState>): void {
  syncState = { ...syncState, ...next };
  for (const listener of syncListeners) listener();
}

function subscribeToSync(listener: () => void): () => void {
  syncListeners.add(listener);
  return () => syncListeners.delete(listener);
}

export function useSyncState(): SyncState {
  return useSyncExternalStore(subscribeToSync, () => syncState, () => syncState);
}

// ---------------------------------------------------------------------------
// Sending.
// ---------------------------------------------------------------------------

/**
 * What happened to recent entries. sendNow reads its own entry's answer from
 * here (and removes it); answers nobody waits for drop off after MAX_RECENT.
 */
const recentOutcomes = new Map<string, EntryOutcome>();
const MAX_RECENT = 200;

function remember(tillCode: string, outcomes: Map<string, EntryOutcome>): void {
  const notices: RenumberNotice[] = [];
  for (const [id, outcome] of outcomes) {
    recentOutcomes.set(id, outcome);
    if (outcome.kind === "sale" && outcome.printedNumber && outcome.printedNumber !== outcome.result.receiptNumber) {
      notices.push({ id, printed: outcome.printedNumber, recorded: outcome.result.receiptNumber });
    }
  }
  addNotices(tillCode, notices);
  for (const id of recentOutcomes.keys()) {
    if (recentOutcomes.size <= MAX_RECENT) break;
    recentOutcomes.delete(id);
  }
}

async function drainOnce(tillCode: string, cashierId: string): Promise<SyncFailure | null> {
  const run = async () => {
    const { outcomes, failure } = await drainOutbox(storeFor(tillCode), apiFor(tillCode), cashierId, failureOf);
    remember(tillCode, outcomes);
    return failure;
  };
  // Another tab of the till sending at the same moment would send the same entries twice.
  if (typeof navigator !== "undefined" && navigator.locks) return navigator.locks.request(`boamah-till-sync-${tillCode}`, run);
  return run();
}

let running: Promise<void> | null = null;
/** Who asked last: a send requested while one runs goes again after it, for that cashier. */
let requested: { tillCode: string; cashierId: string } | null = null;

/** Sends what is waiting. A request made while a send is running starts another one after it. */
export function requestSync(tillCode: string, cashierId: string): Promise<void> {
  requested = { tillCode, cashierId };
  if (running) return running;
  running = (async () => {
    setSyncState({ syncing: true });
    let failure: SyncFailure | null = null;
    while (requested) {
      const next = requested;
      requested = null;
      try {
        failure = await drainOnce(next.tillCode, next.cashierId);
      } catch (error) {
        failure = failureOf(error);
      }
    }
    setSyncState({ syncing: false, failure, lastAttemptAt: new Date().toISOString() });
  })().finally(() => {
    running = null;
  });
  return running;
}

/**
 * Sends straight away and waits a little for one entry's answer. Null when
 * the answer has not come in time; the entry stays waiting and is sent later.
 */
export async function sendNow(tillCode: string, cashierId: string, entryId: string, waitMs: number): Promise<EntryOutcome | null> {
  recentOutcomes.delete(entryId);
  let timer: number | undefined;
  await Promise.race([requestSync(tillCode, cashierId), new Promise<void>((resolve) => (timer = window.setTimeout(resolve, waitMs)))]);
  window.clearTimeout(timer);
  const outcome = recentOutcomes.get(entryId) ?? null;
  recentOutcomes.delete(entryId);
  // Answered in time, so the receipt has not been shown yet: a new number needs no notice.
  if (outcome) dismissNotice(tillCode, entryId);
  return outcome;
}

// ---------------------------------------------------------------------------
// Hooks for the screens.
// ---------------------------------------------------------------------------

export function useOutbox(tillCode: string): OutboxEntry[] {
  return useSyncExternalStore(subscribeToTill, () => loadOutbox(tillCode), () => NO_ENTRIES);
}

export function useUnreadableCount(tillCode: string): number {
  return useSyncExternalStore(subscribeToTill, () => unreadableCount(tillCode), () => 0);
}

export function useNotices(tillCode: string): RenumberNotice[] {
  return useSyncExternalStore(subscribeToTill, () => loadNotices(tillCode), () => NO_NOTICES);
}

export function useShiftRecord(tillCode: string): ShiftRecord | null {
  return useSyncExternalStore(subscribeToTill, () => loadShiftRecord(tillCode), () => null);
}

export function useLastContact(tillCode: string): string | null {
  return useSyncExternalStore(subscribeToTill, () => loadLastContact(tillCode), () => null);
}

export function useHeldSales(tillCode: string): HeldSale[] {
  return useSyncExternalStore(subscribeToTill, () => loadHeldSales(tillCode), () => NO_HELD);
}

/** Keeps the page's answer about the open shift if it is newer than the one stored. */
export function adoptPageRecord(tillCode: string, record: ShiftRecord): void {
  adoptRecord({ shiftRecord: () => loadShiftRecord(tillCode), saveShiftRecord: (next) => saveShiftRecord(tillCode, next) }, record);
}

/** Sends this cashier's waiting entries whenever there is a chance they get through. */
export function useOutboxSync(tillCode: string, cashierId: string, hasWaiting: boolean): void {
  useEffect(() => {
    if (!hasWaiting) return;
    const sync = () => {
      if (navigator.onLine && document.visibilityState === "visible") void requestSync(tillCode, cashierId);
    };
    sync();
    const timer = window.setInterval(sync, RETRY_MS);
    window.addEventListener("online", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [tillCode, cashierId, hasWaiting]);
}

// ---------------------------------------------------------------------------
// One window at a time: two would each count receipts and write the outbox.
// ---------------------------------------------------------------------------

/** How long a newly opened window waits for one that is closing (a reload) to let go. */
const TAB_WAIT_MS = 2_000;

export type TillTab = "checking" | "here" | "elsewhere";

/** Whether this window runs the till. takeOver moves the till here from another window. */
export function useTillTab(tillCode: string): { tab: TillTab; takeOver: () => void } {
  const supported = typeof navigator !== "undefined" && "locks" in navigator;
  const [tab, setTab] = useState<TillTab>(supported ? "checking" : "here");
  const [steal, setSteal] = useState(false);

  useEffect(() => {
    if (!supported) return;
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    const options: LockOptions = steal ? { steal: true } : { signal: AbortSignal.timeout(TAB_WAIT_MS) };
    navigator.locks
      .request(`boamah-till-window-${tillCode}`, options, async () => {
        setTab("here");
        await held;
      })
      // Timed out waiting, or another window took the till over.
      .catch(() => setTab("elsewhere"));
    return () => release();
  }, [tillCode, steal, supported]);

  return { tab, takeOver: () => setSteal(true) };
}
