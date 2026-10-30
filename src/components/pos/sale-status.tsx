"use client";

import { useEffect } from "react";
import { CloudUpload, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/feedback";
import { formatMoney } from "@/lib/money";
import { POS_TENDER_LABELS } from "@/lib/pos";
import type { PosRefundRecord } from "@/lib/pos-returns";
import type { ReceiptData } from "@/lib/pos-till";
import { PrintArea, ReceiptDocument, RefundDocument, type ShopDetails } from "./receipt";
import type { TillPrefs } from "./till-storage";

/** A sale just paid for, on its way to the shop's system while the customer is still there. */
export type SendState =
  | { status: "sending"; receiptNumber: string }
  | { status: "rejected"; entryId: string; receiptNumber: string; message: string; shiftClosed: boolean; serverTime: string };

const blockClose = (event: Event) => event.preventDefault();

interface SendingDialogProps {
  state: SendState | null;
  /** The server refused the sale: go back to it to put it right. */
  onBack: () => void;
  /** The shift was closed (by a manager, elsewhere): go back to opening one. */
  onShiftEnded: () => void;
}

/**
 * Shown for the few seconds a paid sale takes to reach the shop's system,
 * and when the system refuses it while the customer is still at the counter.
 * A sale that cannot be sent waits on the till instead (see the receipt).
 */
export function SendingDialog({ state, onBack, onShiftEnded }: SendingDialogProps) {
  return (
    <Dialog open={state !== null}>
      {state ? (
        <DialogContent
          hideClose
          title={state.status === "sending" ? "Saving the sale" : "The sale was not accepted"}
          className="max-w-md"
          onEscapeKeyDown={blockClose}
          onPointerDownOutside={blockClose}
          onInteractOutside={blockClose}
        >
          {state.status === "sending" ? (
            <p role="status" className="flex items-center gap-3 text-sm text-ink-muted">
              <Spinner className="text-brand-700" label="Saving" /> Sending receipt {state.receiptNumber} to the shop&apos;s system.
            </p>
          ) : (
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
  /** The sale is saved on the till and goes to the shop's system once the connection is back. */
  waiting: boolean;
  shop: ShopDetails;
  prefs: TillPrefs;
  onClose: () => void;
}

export function ReceiptDialog({ receipt, copy, waiting, shop, prefs, onClose }: ReceiptDialogProps) {
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
        <DialogContent title={copy ? "Copy of a receipt" : "Sale complete"} description={`Receipt ${receipt.receiptNumber}`} className="max-w-md">
          <div className="space-y-4">
            {!copy && receipt.changeMinor > 0 ? (
              <div className="rounded-lg bg-gold-100 px-4 py-3 text-center">
                <p className="text-xs font-semibold uppercase tracking-wider text-gold-700">Change to give</p>
                <p className="font-display text-4xl font-extrabold tabular-nums text-brand-900">{formatMoney(receipt.changeMinor)}</p>
              </div>
            ) : null}
            {!copy && waiting ? (
              <p role="status" className="flex gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
                <CloudUpload className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                Saved on this till. It goes to the shop&apos;s system by itself once the connection is back.
              </p>
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

interface RefundSlipDialogProps {
  refund: PosRefundRecord | null;
  /** A reprint of an earlier refund slip, marked as a copy. */
  copy: boolean;
  shop: ShopDetails;
  prefs: TillPrefs;
  onClose: () => void;
}

/** A refund just given, or a copy of an earlier one, with its slip to print. */
export function RefundSlipDialog({ refund, copy, shop, prefs, onClose }: RefundSlipDialogProps) {
  const autoPrint = refund !== null && !copy && prefs.autoPrint;
  useEffect(() => {
    if (!autoPrint) return;
    const timer = window.setTimeout(() => window.print(), 150);
    return () => window.clearTimeout(timer);
  }, [autoPrint, refund]);

  return (
    <Dialog open={refund !== null} onOpenChange={(open) => !open && onClose()}>
      {refund ? (
        <DialogContent title={copy ? "Copy of a refund slip" : "Refund recorded"} description={`Refund ${refund.number} for receipt ${refund.receiptNumber}`} className="max-w-md">
          <div className="space-y-4">
            {copy ? null : (
              <div className="rounded-lg bg-gold-100 px-4 py-3 text-center">
                <p className="text-xs font-semibold uppercase tracking-wider text-gold-700">
                  {refund.method === "CREDIT" ? "Taken off their account" : `Give back by ${POS_TENDER_LABELS[refund.method].toLowerCase()}`}
                </p>
                <p className="font-display text-4xl font-extrabold tabular-nums text-brand-900">{formatMoney(refund.refundMinor)}</p>
              </div>
            )}
            <div className="max-h-[50dvh] overflow-y-auto">
              <RefundDocument refund={refund} shop={shop} paper={prefs.paper} copy={copy} />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="lg" onClick={() => window.print()}>
                <Printer /> Print
              </Button>
              <Button size="lg" className="flex-1" onClick={onClose} autoFocus>
                Done
              </Button>
            </div>
          </div>
          <PrintArea>
            <RefundDocument refund={refund} shop={shop} paper={prefs.paper} copy={copy} />
          </PrintArea>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
