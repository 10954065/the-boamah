"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { CloudOff, MonitorX, UserRoundX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/feedback";
import type { PosShiftClose, PosShiftView } from "@/lib/pos";
import { effectiveShift, localShiftReport, newEntryState, newerRecord, type ShiftCloseEntry, type ShiftOpenEntry } from "@/lib/pos-outbox";
import { formatDateTime } from "@/lib/utils";
import { CloseShiftDialog, type CloseOutcome, type ShiftCount } from "./close-shift-dialog";
import { OpenShiftForm } from "./open-shift";
import type { ShopDetails } from "./receipt";
import { SellScreen, type TillCashier, type TillInfo } from "./sell-screen";
import { SyncStatus, TillBanner } from "./sync-status";
import { TillHeader, TillSignOut, TillTitle, useMinuteClock } from "./till-header";
import { warmTill } from "./till-offline";
import { addToOutbox, journalFor, loadPrefs, noteContact, removeFromOutbox, saveLastReceipt, savePrefs, type TillPrefs } from "./till-storage";
import {
  adoptPageRecord,
  ANSWER_WAIT_MS,
  sendNow,
  STORAGE_FULL,
  tidyJournals,
  useLastContact,
  useOutbox,
  useOutboxSync,
  useShiftRecord,
  useTillTab,
} from "./till-sync";

export interface TillAppProps {
  till: TillInfo;
  cashier: TillCashier;
  /** The shift open on this till when the page was made, whoever it belongs to. */
  initialShift: PosShiftView | null;
  /** When the page was made, by the server's clock. A page opened offline is an old copy. */
  renderedAt: string;
  shop: ShopDetails;
}

const noSubscription = () => () => {};

/**
 * A till that has not reached the shop's system for this long stops selling
 * until it has: a cashier who has left or been switched off cannot carry on
 * offline for ever on a device left signed in.
 */
const MAX_OFFLINE_MS = 3 * 86_400_000;

/** The till: open a shift, sell, close the shift. One shift runs on a till at a time. */
export function TillApp(props: TillAppProps) {
  // The till keeps its outbox and receipt counter on the device, so it only renders in the browser.
  const inBrowser = useSyncExternalStore(noSubscription, () => true, () => false);
  if (!inBrowser) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-brand-700">
        <Spinner label="Opening the till" />
      </div>
    );
  }
  return <TillWindow {...props} />;
}

/** The till runs in one window at a time; two would each count receipts and write the outbox. */
function TillWindow(props: TillAppProps) {
  const { tab, takeOver } = useTillTab(props.till.code);
  if (tab === "here") return <TillScreens {...props} />;
  if (tab === "checking") {
    return (
      <div className="flex min-h-dvh items-center justify-center text-brand-700">
        <Spinner label="Opening the till" />
      </div>
    );
  }
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl border border-line bg-surface p-6 text-center shadow-[var(--shadow-raised)]">
        <MonitorX className="mx-auto h-10 w-10 text-gold-500" aria-hidden="true" />
        <h1 className="mt-3 font-display text-xl font-extrabold">The till is open in another window</h1>
        <p className="mt-2 text-sm leading-6 text-ink-muted">Only one window can run the till on this device. Carry on in the other window, or move the till here.</p>
        <Button size="lg" className="mt-5 w-full" onClick={takeOver}>
          Use the till in this window
        </Button>
      </div>
    </main>
  );
}

function TillScreens({ till, cashier, initialShift, renderedAt, shop }: TillAppProps) {
  const entries = useOutbox(till.code);
  const storedRecord = useShiftRecord(till.code);
  const pageRecord = useMemo(() => ({ shift: initialShift, asOf: renderedAt }), [initialShift, renderedAt]);
  // While an opening or closing the cashier just made is on its way, the screen waits for the answer before following it.
  const [inFlight, setInFlight] = useState<string | null>(null);
  const visibleEntries = inFlight ? entries.filter((entry) => entry.id !== inFlight) : entries;
  const shift = effectiveShift(newerRecord(storedRecord, pageRecord), visibleEntries, cashier.id);
  const ownWaiting = entries.some((entry) => entry.cashierId === cashier.id && entry.status === "waiting");
  const [prefs, setPrefs] = useState<TillPrefs>(loadPrefs);
  const [counting, setCounting] = useState<PosShiftView | null>(null);
  const storedContact = useLastContact(till.code);
  const minute = useMinuteClock();
  const lastContact = storedContact && Date.parse(storedContact) > Date.parse(renderedAt) ? storedContact : renderedAt;
  const outOfTouch = minute > 0 && minute * 60_000 - Date.parse(lastContact) > MAX_OFFLINE_MS;

  useOutboxSync(till.code, cashier.id, ownWaiting);
  useEffect(() => {
    adoptPageRecord(till.code, pageRecord);
    noteContact(till.code, pageRecord.asOf);
    warmTill();
  }, [till.code, pageRecord]);
  useEffect(() => tidyJournals(till.code, shift?.clientId ?? null), [till.code, shift?.clientId]);

  function changePrefs(next: TillPrefs) {
    setPrefs(next);
    savePrefs(next);
  }

  /** Resolves to an error message, or null once the shift is open (on the till, and on the server when it can be reached). */
  async function openShift(openingFloatMinor: number): Promise<string | null> {
    const openedAt = new Date().toISOString();
    const opened: PosShiftView = {
      clientId: crypto.randomUUID(),
      tillCode: till.code,
      cashierId: cashier.id,
      cashierName: cashier.name,
      openedAt,
      openingFloatMinor,
      closedAt: null,
      countedMinor: null,
      notes: null,
    };
    const entry: ShiftOpenEntry = {
      kind: "shift-open",
      id: opened.clientId,
      cashierId: cashier.id,
      cashierName: cashier.name,
      createdAt: openedAt,
      ...newEntryState,
      input: { clientId: opened.clientId, tillCode: till.code, openedAt, openingFloatMinor },
      shift: opened,
    };
    if (!navigator.onLine) return addToOutbox(till.code, entry) ? null : STORAGE_FULL;
    setInFlight(entry.id);
    try {
      if (!addToOutbox(till.code, entry)) return STORAGE_FULL;
      const outcome = await sendNow(till.code, cashier.id, entry.id, ANSWER_WAIT_MS);
      if (outcome?.kind !== "refused") return null;
      // Refused while the cashier is here (for example another shift is open): nothing was opened.
      removeFromOutbox(till.code, entry.id);
      return outcome.error;
    } finally {
      setInFlight(null);
    }
  }

  async function closeShift(target: PosShiftView, count: ShiftCount): Promise<CloseOutcome> {
    const close: PosShiftClose = { clientId: target.clientId, closedAt: new Date().toISOString(), ...count };
    const report = localShiftReport(target, close, journalFor(till.code, target.clientId));
    const entry: ShiftCloseEntry = {
      kind: "shift-close",
      id: crypto.randomUUID(),
      cashierId: cashier.id,
      cashierName: cashier.name,
      createdAt: close.closedAt,
      ...newEntryState,
      input: close,
      report,
    };
    setInFlight(entry.id);
    try {
      if (!addToOutbox(till.code, entry)) return { error: STORAGE_FULL };
      // Receipts from a closed shift are not reprinted.
      saveLastReceipt(till.code, null);
      if (!navigator.onLine) return { report, confirmed: false };
      const outcome = await sendNow(till.code, cashier.id, entry.id, ANSWER_WAIT_MS);
      if (outcome?.kind === "shift-close") return { report: outcome.report, confirmed: true };
      if (outcome?.kind !== "refused") return { report, confirmed: false };
      removeFromOutbox(till.code, entry.id);
      return { error: outcome.error };
    } finally {
      setInFlight(null);
    }
  }

  /** A manager closed this shift while the till could not hear of it; the server's answer is the newest word. */
  function shiftClosedElsewhere(closed: PosShiftView, serverTime: string) {
    if (storedRecord?.shift?.clientId === closed.clientId || pageRecord.shift?.clientId === closed.clientId) {
      adoptPageRecord(till.code, { shift: null, asOf: serverTime });
    }
    saveLastReceipt(till.code, null);
  }

  const screen = outOfTouch ? (
    <OutOfTouch since={lastContact} />
  ) : shift && shift.cashierId === cashier.id ? (
      <SellScreen
        till={till}
        cashier={cashier}
        shift={shift}
        shop={shop}
        prefs={prefs}
        onPrefsChange={changePrefs}
        onCloseShift={() => setCounting(shift)}
        onShiftClosedElsewhere={(serverTime) => shiftClosedElsewhere(shift, serverTime)}
      />
    ) : (
      <div className="flex min-h-dvh flex-col md:flex-row">
        <TillHeader
          till={till}
          cashierName={cashier.name}
          status={<SyncStatus tillCode={till.code} cashier={cashier} />}
          footer={<TillSignOut tillCode={till.code} cashierId={cashier.id} />}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <TillTitle title={shift ? "Shift still open" : "Open the till"} detail={`Till ${till.code} · ${till.name} · ${cashier.name}`} />
          <TillBanner tillCode={till.code} cashier={cashier} shift={null} />
          <main id="main" className="flex flex-1 items-center justify-center p-4">
            {shift ? (
              <ShiftInUse shift={shift} canManage={cashier.canManage} onClose={() => setCounting(shift)} />
            ) : (
              <OpenShiftForm cashierName={cashier.name} onOpen={openShift} />
            )}
          </main>
        </div>
      </div>
    );

  // The close dialog stays in one place while the screen behind it changes, so the report survives the shift closing.
  return (
    <>
      {screen}
      <CloseShiftDialog shift={counting} shop={shop} paper={prefs.paper} onSubmit={closeShift} onDone={() => setCounting(null)} />
    </>
  );
}

function OutOfTouch({ since }: { since: string }) {
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl border border-line bg-surface p-6 text-center shadow-[var(--shadow-raised)]">
        <CloudOff className="mx-auto h-10 w-10 text-gold-500" aria-hidden="true" />
        <h1 className="mt-3 font-display text-xl font-extrabold">Connect the till to carry on</h1>
        <p className="mt-2 text-sm leading-6 text-ink-muted">
          This till has not reached the shop&apos;s system since {formatDateTime(since)}. Selling stops after 3 days without a connection. Connect the device to the
          internet; everything waiting on the till is kept and sent.
        </p>
        <Button size="lg" className="mt-5 w-full" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </div>
    </main>
  );
}

function ShiftInUse({ shift, canManage, onClose }: { shift: PosShiftView; canManage: boolean; onClose: () => void }) {
  const firstName = shift.cashierName.split(" ")[0];
  return (
    <div className="w-full max-w-md rounded-xl border border-line bg-surface p-6 text-center shadow-[var(--shadow-raised)]">
      <UserRoundX className="mx-auto h-10 w-10 text-gold-500" aria-hidden="true" />
      <h1 className="mt-3 font-display text-xl font-extrabold">{shift.cashierName}&apos;s shift is still open</h1>
      <p className="mt-2 text-sm leading-6 text-ink-muted">
        Till {shift.tillCode} has been open under {shift.cashierName} since {formatDateTime(shift.openedAt)}. Only one shift can run on a till at a time.
      </p>
      {canManage ? (
        <Button size="lg" className="mt-5 w-full" onClick={onClose}>
          Count and close that shift
        </Button>
      ) : (
        <>
          <p className="mt-3 text-sm text-ink-muted">Ask {firstName} or a manager to close it, then check again.</p>
          <Button variant="outline" size="lg" className="mt-5 w-full" onClick={() => window.location.reload()}>
            Check again
          </Button>
        </>
      )}
    </div>
  );
}
