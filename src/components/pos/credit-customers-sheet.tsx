"use client";

import { useState, type FormEvent } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, SheetContent } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import type { TillCreditCustomer } from "@/lib/credit";
import { formatMoney, minorToDecimalString, parseDecimalToMinor } from "@/lib/money";
import { POS_TENDER_LABELS, POS_TENDERS, type PosShiftView, type PosTenderCode } from "@/lib/pos";
import { cn } from "@/lib/utils";
import { CreditCustomerPicker, standingText } from "./credit-customer-picker";
import { CreditPaymentDocument, PrintArea, type CreditPaymentSlip, type ShopDetails } from "./receipt";
import type { TillCashier } from "./sell-screen";
import { failureOf, tillOnlineApi } from "./till-api";
import { addToJournal, type TillPrefs } from "./till-storage";
import type { CreditCustomers } from "./use-credit-customers";

interface CreditCustomersSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  credit: CreditCustomers;
  cashier: TillCashier;
  shift: PosShiftView;
  tillCode: string;
  shop: ShopDetails;
  prefs: TillPrefs;
}

/** Credit customers at the till: what each owes, and payments towards it, which go into this shift's drawer. */
export function CreditCustomersSheet({ open, onOpenChange, credit, cashier, shift, tillCode, shop, prefs }: CreditCustomersSheetProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [slip, setSlip] = useState<CreditPaymentSlip | null>(null);
  const selected = selectedId ? (credit.customers.find((c) => c.id === selectedId) ?? null) : null;

  function close(next: boolean) {
    if (!next) {
      setSelectedId(null);
      setSlip(null);
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <SheetContent side="right" title="Credit customers" closeLabel="Back to selling">
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {slip ? (
            <PaymentDone slip={slip} shop={shop} prefs={prefs} onDone={() => setSlip(null)} />
          ) : selected ? (
            <>
              <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedId(null)}>
                <ArrowLeft /> All credit customers
              </Button>
              <CustomerCard customer={selected} />
              <TakePayment
                key={selected.id}
                customer={selected}
                onPaid={(paid) => {
                  addToJournal(tillCode, shift.clientId, { kind: "credit-payment", clientId: paid.clientId, method: paid.method, amountMinor: paid.amountMinor });
                  void credit.refresh();
                  setSlip({ ...paid, cashierName: cashier.name });
                }}
                shiftClientId={shift.clientId}
              />
            </>
          ) : (
            <>
              <p className="text-sm text-ink-muted">Find a customer to see what they owe or take a payment. Sales on account are made from Charge, with &ldquo;On account&rdquo;.</p>
              <CreditCustomerPicker credit={credit} chosen={null} onChoose={(customer) => setSelectedId(customer?.id ?? null)} allowStopped />
            </>
          )}
        </div>
      </SheetContent>
    </Dialog>
  );
}

function CustomerCard({ customer }: { customer: TillCreditCustomer }) {
  return (
    <div className="rounded-lg bg-brand-900 px-4 py-3 text-white">
      <p className="font-display text-lg font-extrabold">{customer.name}</p>
      <p className="text-sm text-white/80">{customer.phone}</p>
      <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-white/70">Owes</p>
      <p className="font-display text-3xl font-extrabold tabular-nums">{formatMoney(customer.balanceMinor)}</p>
      <p className="text-xs text-white/70">{standingText(customer)}</p>
    </div>
  );
}

function TakePayment({ customer, shiftClientId, onPaid }: { customer: TillCreditCustomer; shiftClientId: string; onPaid: (slip: Omit<CreditPaymentSlip, "cashierName">) => void }) {
  const [method, setMethod] = useState<PosTenderCode>("CASH");
  const [amountText, setAmountText] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Kept across retries, so a payment that reached the shop before the answer was lost is recorded once.
  const [clientId, setClientId] = useState(() => crypto.randomUUID());

  if (customer.balanceMinor <= 0) return <p className="text-sm text-ink-muted">{customer.name} does not owe anything.</p>;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const amountMinor = parseDecimalToMinor(amountText) ?? 0;
    if (amountMinor <= 0) return setError("Enter the amount paid.");
    if (method === "MOMO" && !reference.trim()) return setError("Enter the mobile money transaction ID.");
    if (!navigator.onLine) return setError("Payments need the internet. Try again once the till is back online.");
    setBusy(true);
    setError(null);
    try {
      const result = await tillOnlineApi.takeCreditPayment({
        shiftClientId,
        payment: { clientId, customerId: customer.id, amountMinor, method, reference: reference.trim() || null },
      });
      if (result.status === "rejected") setError(result.error);
      else {
        const paid = result.payment;
        setClientId(crypto.randomUUID());
        onPaid({
          clientId: paid.clientId,
          customerName: paid.customerName,
          customerPhone: paid.customerPhone,
          receivedAt: paid.receivedAt,
          method: paid.method,
          reference: paid.reference,
          amountMinor: paid.amountMinor,
          owedAfterMinor: paid.owedAfterMinor,
        });
      }
    } catch (failure) {
      setError(failureOf(failure).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-line p-3">
      <p className="font-semibold">Take a payment</p>
      <div role="group" aria-label="Paid by" className="grid grid-cols-3 gap-1.5">
        {POS_TENDERS.map((code) => (
          <button
            key={code}
            type="button"
            aria-pressed={method === code}
            onClick={() => setMethod(code)}
            className={cn(
              "h-10 rounded-md border text-sm font-semibold transition-colors",
              method === code ? "border-brand-700 bg-brand-700 text-white" : "border-line-strong bg-surface hover:bg-soft",
            )}
          >
            {POS_TENDER_LABELS[code]}
          </button>
        ))}
      </div>
      <div>
        <label htmlFor="credit-pay-amount" className="mb-1 block text-sm font-semibold">
          Amount paid
        </label>
        <div className="flex gap-2">
          <Input
            id="credit-pay-amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value.replace(/[^\d.]/g, ""))}
            className="h-11 text-lg font-bold tabular-nums"
          />
          <Button type="button" variant="outline" className="h-11 shrink-0" onClick={() => setAmountText(minorToDecimalString(customer.balanceMinor))}>
            All {formatMoney(customer.balanceMinor)}
          </Button>
        </div>
      </div>
      {method === "CASH" ? null : (
        <div>
          <label htmlFor="credit-pay-reference" className="mb-1 block text-sm font-semibold">
            {method === "MOMO" ? "Transaction ID" : "Approval code (optional)"}
          </label>
          <Input id="credit-pay-reference" autoComplete="off" maxLength={60} value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
      )}
      {error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy ? <Spinner label="Saving" /> : null} Record payment
      </Button>
      <p className="text-xs text-ink-muted">The money goes into this shift&rsquo;s drawer and is counted when the shift closes.</p>
    </form>
  );
}

function PaymentDone({ slip, shop, prefs, onDone }: { slip: CreditPaymentSlip; shop: ShopDetails; prefs: TillPrefs; onDone: () => void }) {
  return (
    <div className="space-y-4">
      <div role="status" className="rounded-lg bg-gold-100 px-4 py-3 text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-gold-700">Payment recorded</p>
        <p className="font-display text-3xl font-extrabold tabular-nums text-brand-900">{formatMoney(slip.amountMinor)}</p>
        <p className="text-sm text-gold-700">
          {slip.customerName} now owes {formatMoney(slip.owedAfterMinor)}
        </p>
      </div>
      <CreditPaymentDocument slip={slip} shop={shop} paper={prefs.paper} />
      <div className="flex gap-2">
        <Button variant="outline" size="lg" className="flex-1" onClick={() => window.print()}>
          Print slip
        </Button>
        <Button size="lg" className="flex-1" onClick={onDone}>
          Done
        </Button>
      </div>
      <PrintArea>
        <CreditPaymentDocument slip={slip} shop={shop} paper={prefs.paper} />
      </PrintArea>
    </div>
  );
}
