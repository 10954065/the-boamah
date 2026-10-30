"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { formatMoney } from "@/lib/money";
import { POS_TENDER_LABELS, type SaleTenderCode } from "@/lib/pos";
import { VOID_REASONS, type PosSaleRecord } from "@/lib/pos-returns";
import { approvalReady, approvalToSend, ManagerApprovalFields, NO_APPROVAL, ReasonField, reasonReady, withoutPassword } from "./manager-approval";
import { failureOf, tillOnlineApi } from "./till-api";

interface VoidSaleDialogProps {
  sale: PosSaleRecord | null;
  shiftClientId: string;
  canManage: boolean;
  onClose: () => void;
  onVoided: (sale: PosSaleRecord) => void;
}

/** Voids a sale of this shift: the money goes back the way it came and the goods go back on the shelf. */
export function VoidSaleDialog({ sale, shiftClientId, canManage, onClose, onVoided }: VoidSaleDialogProps) {
  return (
    <Dialog open={sale !== null} onOpenChange={(open) => !open && onClose()}>
      {sale ? (
        <DialogContent title={`Void receipt ${sale.receiptNumber}`} description="The whole sale is cancelled and every item goes back into stock." className="max-w-md">
          <VoidForm key={sale.id} sale={sale} shiftClientId={shiftClientId} canManage={canManage} onVoided={onVoided} />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

/** What goes back to the customer, by how they paid: cash less the change they were given. A part on account comes off it. */
function giveBack(sale: PosSaleRecord): { method: SaleTenderCode; amountMinor: number }[] {
  return sale.payments
    .map((payment) => ({ method: payment.method, amountMinor: payment.method === "CASH" ? payment.amountMinor - sale.changeMinor : payment.amountMinor }))
    .filter((part) => part.amountMinor > 0);
}

function VoidForm({ sale, shiftClientId, canManage, onVoided }: Omit<VoidSaleDialogProps, "sale" | "onClose"> & { sale: PosSaleRecord }) {
  const [reason, setReason] = useState("");
  const [approval, setApproval] = useState(NO_APPROVAL);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = reasonReady(reason) && approvalReady(canManage, approval);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await tillOnlineApi.voidSale({ saleId: sale.id, shiftClientId, reason: reason.trim(), approval: approvalToSend(canManage, approval) });
      if (result.status === "rejected") setError(result.error);
      else onVoided(result.sale);
    } catch (failure) {
      setError(failureOf(failure).message);
    } finally {
      setApproval(withoutPassword);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="rounded-lg bg-gold-100 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-gold-700">Give back to the customer</p>
        <ul className="mt-1 space-y-0.5">
          {giveBack(sale).map((part) => (
            <li key={part.method} className="flex justify-between font-display text-lg font-extrabold tabular-nums text-brand-900">
              <span>{part.method === "CREDIT" ? "Off their account" : POS_TENDER_LABELS[part.method]}</span>
              <span>{formatMoney(part.amountMinor)}</span>
            </li>
          ))}
        </ul>
      </div>
      <ReasonField reasons={VOID_REASONS} value={reason} onChange={setReason} />
      <ManagerApprovalFields canManage={canManage} value={approval} onChange={setApproval} />
      {error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" variant="danger" size="lg" className="w-full" disabled={!ready || busy}>
        {busy ? "Voiding the sale" : `Void the sale (${formatMoney(sale.totalMinor)})`}
      </Button>
    </form>
  );
}
