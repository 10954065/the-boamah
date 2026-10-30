"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Checkbox, Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/money";
import { POS_TENDER_LABELS, POS_TENDERS, type PosTenderCode } from "@/lib/pos";
import {
  refundForLine,
  refundMethodProblem,
  RETURN_REASONS,
  returnableMilli,
  returnQuantityProblem,
  type PosRefundRecord,
  type PosSaleLineRecord,
  type PosSaleRecord,
} from "@/lib/pos-returns";
import { formatQuantity, milliToDecimalString, parseDecimalToMilli, UNIT_INFO } from "@/lib/quantity";
import { cn } from "@/lib/utils";
import { approvalReady, approvalToSend, ManagerApprovalFields, NO_APPROVAL, ReasonField, reasonReady, withoutPassword } from "./manager-approval";
import { failureOf, tillOnlineApi } from "./till-api";

interface ReturnItemsDialogProps {
  sale: PosSaleRecord | null;
  /**
   * The return's own id, kept by the caller until the shop's system has
   * answered: sent again after a lost answer, the return is recorded once.
   */
  clientId: string;
  tillCode: string;
  shiftClientId: string;
  canManage: boolean;
  onClose: () => void;
  onReturned: (refund: PosRefundRecord, sale: PosSaleRecord) => void;
}

/** Goods brought back from a sale: what comes back, how the money goes back, and why. */
export function ReturnItemsDialog({ sale, onClose, ...props }: ReturnItemsDialogProps) {
  return (
    <Dialog open={sale !== null} onOpenChange={(open) => !open && onClose()}>
      {sale ? (
        <DialogContent title={`Return items from ${sale.receiptNumber}`} description="The refund is paid out of this shift." className="max-w-xl">
          <ReturnForm key={sale.id} sale={sale} {...props} />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

interface LineChoice {
  line: PosSaleLineRecord;
  quantityMilli: number | null;
  problem: string | null;
  refundMinor: number;
  restock: boolean;
}

function ReturnForm({ sale, clientId, tillCode, shiftClientId, canManage, onReturned }: Omit<ReturnItemsDialogProps, "sale" | "onClose"> & { sale: PosSaleRecord }) {
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [damaged, setDamaged] = useState<Record<string, boolean>>({});
  const [method, setMethod] = useState<PosTenderCode>(sale.payments[0]?.method ?? "CASH");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [approval, setApproval] = useState(NO_APPROVAL);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const returnable = sale.lines.filter((line) => returnableMilli(line) > 0);
  const choices: LineChoice[] = returnable.flatMap((line) => {
    const text = amounts[line.id]?.trim() ?? "";
    if (!text) return [];
    const quantityMilli = parseDecimalToMilli(text);
    const problem = quantityMilli === null ? `Enter how much ${line.productName} is coming back, for example 1 or 0.5.` : returnQuantityProblem(line, quantityMilli);
    return [{ line, quantityMilli, problem, refundMinor: quantityMilli !== null && !problem ? refundForLine(line, quantityMilli) : 0, restock: !damaged[line.id] }];
  });
  const lineProblem = choices.find((choice) => choice.problem)?.problem ?? null;
  const methodProblem = refundMethodProblem(method, reference);
  const refundMinor = choices.reduce((sum, choice) => sum + choice.refundMinor, 0);
  const ready = choices.length > 0 && !lineProblem && !methodProblem && reasonReady(reason) && approvalReady(canManage, approval);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await tillOnlineApi.returnItems({
        clientId,
        saleId: sale.id,
        tillCode,
        shiftClientId,
        items: choices.map((choice) => ({ saleItemId: choice.line.id, quantityMilli: choice.quantityMilli!, restock: choice.restock })),
        method,
        reference: reference.trim() || null,
        reason: reason.trim(),
        approval: approvalToSend(canManage, approval),
      });
      if (result.status === "rejected") setError(result.error);
      else onReturned(result.refund, result.sale);
    } catch (failure) {
      setError(failureOf(failure).message);
    } finally {
      setApproval(withoutPassword);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <ul className="divide-y divide-line rounded-md border border-line">
        {returnable.map((line) => {
          const left = returnableMilli(line);
          const choice = choices.find((c) => c.line.id === line.id);
          return (
            <li key={line.id} className="space-y-2 px-3 py-2.5">
              <div className="flex gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {line.productName}
                    {line.variantName ? <span className="font-normal text-ink-muted"> · {line.variantName}</span> : null}
                  </p>
                  <p className="text-xs text-ink-muted tabular-nums">
                    Bought {formatQuantity(line.quantityMilli, line.unit)} at {formatMoney(line.unitPriceMinor)} {UNIT_INFO[line.unit].per}
                    {line.returnedMilli > 0 ? `; ${formatQuantity(line.returnedMilli, line.unit)} back already` : ""}
                  </p>
                </div>
                {choice && !choice.problem ? <p className="shrink-0 text-sm font-bold tabular-nums">{formatMoney(choice.refundMinor)}</p> : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0"
                  aria-label={`How much ${line.productName} comes back, in ${UNIT_INFO[line.unit].plural}`}
                  aria-invalid={Boolean(choice?.problem)}
                  value={amounts[line.id] ?? ""}
                  onChange={(event) => setAmounts({ ...amounts, [line.id]: event.target.value.replace(/[^\d.]/g, "") })}
                  className="h-9 w-24 tabular-nums"
                />
                <span className="text-xs text-ink-muted">{UNIT_INFO[line.unit].plural}</span>
                <Button type="button" size="sm" variant="outline" onClick={() => setAmounts({ ...amounts, [line.id]: milliToDecimalString(left) })}>
                  All {formatQuantity(left, line.unit)}
                </Button>
                <label className="ml-auto flex items-center gap-2 text-xs">
                  <Checkbox checked={!damaged[line.id]} onChange={(event) => setDamaged({ ...damaged, [line.id]: !event.target.checked })} />
                  Fit to sell again
                </label>
              </div>
            </li>
          );
        })}
      </ul>
      {lineProblem ? <p className="text-sm text-danger">{lineProblem}</p> : null}

      <fieldset>
        <legend className="mb-1 text-sm font-semibold">Give the money back by</legend>
        <div className="grid grid-cols-3 gap-1.5">
          {POS_TENDERS.map((tender) => (
            <button
              key={tender}
              type="button"
              aria-pressed={method === tender}
              onClick={() => setMethod(tender)}
              className={cn(
                "h-10 rounded-md border text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                method === tender ? "border-brand-700 bg-brand-700 text-white" : "border-line-strong bg-surface hover:bg-soft",
              )}
            >
              {POS_TENDER_LABELS[tender]}
            </button>
          ))}
        </div>
        {method === "CASH" ? null : (
          <div className="mt-2">
            <label htmlFor="refund-reference" className="mb-1 block text-xs font-semibold">
              {method === "MOMO" ? "Mobile money transaction ID of the refund" : "Card refund approval code (optional)"}
            </label>
            <Input id="refund-reference" maxLength={60} autoComplete="off" value={reference} onChange={(event) => setReference(event.target.value)} />
          </div>
        )}
      </fieldset>

      <ReasonField reasons={RETURN_REASONS} value={reason} onChange={setReason} />
      <ManagerApprovalFields canManage={canManage} value={approval} onChange={setApproval} />
      {error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="lg" className="w-full" disabled={!ready || busy}>
        {busy ? "Recording the return" : choices.length > 0 ? `Refund ${formatMoney(refundMinor)}` : "Enter what comes back"}
      </Button>
    </form>
  );
}
