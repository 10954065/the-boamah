"use client";

import { useState, useSyncExternalStore } from "react";
import { UserRoundX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/feedback";
import { formatDateTime } from "@/lib/utils";
import type { PosShiftView } from "@/server/pos/shifts";
import { CloseShiftDialog } from "./close-shift-dialog";
import { OpenShiftForm } from "./open-shift";
import type { ShopDetails } from "./receipt";
import { SellScreen, type TillCashier, type TillInfo } from "./sell-screen";
import { failureOf, tillApi } from "./till-api";
import { TillHeader, TillSignOut } from "./till-header";
import { DEFAULT_PREFS, loadPrefs, savePrefs, type TillPrefs } from "./till-storage";

export interface TillAppProps {
  till: TillInfo;
  cashier: TillCashier;
  /** The shift open on this till when the page loaded, whoever it belongs to. */
  initialShift: PosShiftView | null;
  shop: ShopDetails;
}

const noSubscription = () => () => {};

/** The till: open a shift, sell, close the shift. One shift runs on a till at a time. */
export function TillApp({ till, cashier, initialShift, shop }: TillAppProps) {
  // The till keeps its receipt counter and unsent sale on the device, so it only renders in the browser.
  const inBrowser = useSyncExternalStore(noSubscription, () => true, () => false);
  const [shift, setShift] = useState(initialShift);
  const [prefs, setPrefs] = useState<TillPrefs>(() => (typeof window === "undefined" ? DEFAULT_PREFS : loadPrefs()));
  const [closing, setClosing] = useState(false);

  function changePrefs(next: TillPrefs) {
    setPrefs(next);
    savePrefs(next);
  }

  async function openShift(openingFloatMinor: number): Promise<string | null> {
    try {
      const result = await tillApi.openShift({ clientId: crypto.randomUUID(), tillCode: till.code, openedAt: new Date().toISOString(), openingFloatMinor });
      if (result.status !== "rejected") setShift(result.shift);
      // A shift opened meanwhile (here or on another device) takes over the screen.
      else if (result.openShift) setShift(result.openShift);
      else return result.error;
      return null;
    } catch (error) {
      return failureOf(error).message;
    }
  }

  if (!inBrowser) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-brand-700">
        <Spinner label="Opening the till" />
      </div>
    );
  }

  if (shift && shift.cashierId === cashier.id) {
    return <SellScreen till={till} cashier={cashier} shift={shift} shop={shop} prefs={prefs} onPrefsChange={changePrefs} onShiftClosed={() => setShift(null)} />;
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <TillHeader till={till} cashierName={cashier.name}>
        <TillSignOut />
      </TillHeader>
      <main id="main" className="flex flex-1 items-center justify-center p-4">
        {shift ? (
          <ShiftInUse shift={shift} canManage={cashier.canManage} onClose={() => setClosing(true)} />
        ) : (
          <OpenShiftForm cashierName={cashier.name} onOpen={openShift} />
        )}
      </main>
      {shift ? (
        <CloseShiftDialog
          open={closing}
          onOpenChange={setClosing}
          shift={shift}
          shop={shop}
          paper={prefs.paper}
          onClosed={() => {
            setClosing(false);
            setShift(null);
          }}
        />
      ) : null}
    </div>
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
