"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CloudOff, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/feedback";
import { formatMoney } from "@/lib/money";
import type { ReceiptData } from "@/lib/pos-till";
import { PrintArea, ReceiptDocument, type ShopDetails } from "./receipt";
import type { TillFailure } from "./till-api";
import type { PendingSale, TillPrefs } from "./till-storage";

export type SendState =
  | { status: "sending" }
  | { status: "failed"; message: string; kind: TillFailure }
  | { status: "rejected"; message: string; shiftClosed: boolean };

const blockClose = (event: Event) => event.preventDefault();

interface PendingSaleDialogProps {
  pending: PendingSale | null;
  state: SendState | null;
  onRetry: () => void;
  /** The server refused the sale: go back to it to put it right. */
  onBack: () => void;
  /** Give up on a sale that could not be sent. */
  onCancel: () => void;
  /** The shift was closed (by a manager, elsewhere): go back to opening one. */
  onShiftEnded: () => void;
}

/** A paid sale on its way to the shop's system. It cannot be dismissed while its fate is unknown. */
export function PendingSaleDialog({ pending, state, onRetry, onBack, onCancel, onShiftEnded }: PendingSaleDialogProps) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const open = pending !== null && state !== null;
  const number = pending?.upload.receiptNumber ?? "";
  const waitingForConnection = state?.status === "failed" && state.kind === "offline";

  // Sent again by itself as soon as the device is back online.
  useEffect(() => {
    if (!waitingForConnection) return;
    window.addEventListener("online", onRetry);
    return () => window.removeEventListener("online", onRetry);
  }, [waitingForConnection, onRetry]);

  return (
    <Dialog open={open}>
      {open ? (
        <DialogContent
          hideClose
          title={state.status === "sending" ? "Saving the sale" : state.status === "rejected" ? "The sale was not accepted" : "The sale has not been saved yet"}
          className="max-w-md"
          onEscapeKeyDown={blockClose}
          onPointerDownOutside={blockClose}
          onInteractOutside={blockClose}
        >
          {state.status === "sending" ? (
            <p role="status" className="flex items-center gap-3 text-sm text-ink-muted">
              <Spinner className="text-brand-700" label="Saving" /> Sending receipt {number} to the shop&apos;s system.
            </p>
          ) : state.status === "rejected" ? (
            <div className="space-y-4">
              <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
                {state.message}
              </p>
              {state.shiftClosed ? (
                <>
                  <p className="text-sm text-ink-muted">Nothing was recorded. A manager closed this shift. Open a new one, then ring up the sale and take the payment again.</p>
                  <Button size="lg" className="w-full" onClick={onShiftEnded}>
                    Open a new shift
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-sm text-ink-muted">Nothing was recorded. Go back to the sale, put it right and take the payment again.</p>
                  <Button size="lg" className="w-full" onClick={onBack}>
                    Back to the sale
                  </Button>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div role="alert" className="flex gap-3 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
                <CloudOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <p>{state.message}</p>
              </div>
              <p className="text-sm text-ink-muted">
                Receipt {number} for {formatMoney(pending.receipt.totalMinor)} is kept on this till. The customer has paid, so keep trying until it goes through.
              </p>
              {state.kind === "signed-out" ? (
                <Button asChild size="lg" className="w-full">
                  <Link href="/pos/login">Sign in again</Link>
                </Button>
              ) : (
                <Button size="lg" className="w-full" onClick={onRetry} autoFocus>
                  Try again
                </Button>
              )}
              <Button
                variant={confirmCancel ? "danger" : "ghost"}
                className="w-full"
                onClick={() => {
                  if (!confirmCancel) return setConfirmCancel(true);
                  setConfirmCancel(false);
                  onCancel();
                }}
              >
                {confirmCancel ? "Cancel it: the customer did not pay" : "Cancel this sale"}
              </Button>
            </div>
          )}
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

interface ReceiptDialogProps {
  receipt: ReceiptData | null;
  /** A reprint of an earlier receipt, marked as a copy. */
  copy: boolean;
  shop: ShopDetails;
  prefs: TillPrefs;
  onClose: () => void;
}

export function ReceiptDialog({ receipt, copy, shop, prefs, onClose }: ReceiptDialogProps) {
  const autoPrint = receipt !== null && !copy && prefs.autoPrint;
  useEffect(() => {
    if (!autoPrint) return;
    // Let the print copy mount first.
    const timer = window.setTimeout(() => window.print(), 150);
    return () => window.clearTimeout(timer);
  }, [autoPrint, receipt]);

  return (
    <Dialog open={receipt !== null} onOpenChange={(open) => !open && onClose()}>
      {receipt ? (
        <DialogContent title={copy ? "Last receipt" : "Sale complete"} description={`Receipt ${receipt.receiptNumber}`} className="max-w-md">
          <div className="space-y-4">
            {!copy && receipt.changeMinor > 0 ? (
              <div className="rounded-lg bg-gold-100 px-4 py-3 text-center">
                <p className="text-xs font-semibold uppercase tracking-wider text-gold-700">Change to give</p>
                <p className="font-display text-4xl font-extrabold tabular-nums text-brand-900">{formatMoney(receipt.changeMinor)}</p>
              </div>
            ) : null}
            <div className="max-h-[50dvh] overflow-y-auto">
              <ReceiptDocument receipt={receipt} shop={shop} paper={prefs.paper} copy={copy} />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="lg" onClick={() => window.print()}>
                <Printer /> Print
              </Button>
              <Button size="lg" className="flex-1" onClick={onClose} autoFocus>
                {copy ? "Done" : "New sale"}
              </Button>
            </div>
          </div>
          <PrintArea>
            <ReceiptDocument receipt={receipt} shop={shop} paper={prefs.paper} copy={copy} />
          </PrintArea>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
