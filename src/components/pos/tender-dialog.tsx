"use client";

import { useState, type FormEvent } from "react";
import { Banknote, BookUser, CreditCard, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { creditProblem, type TillCreditCustomer } from "@/lib/credit";
import { formatMoney, minorToDecimalString, parseDecimalToMinor } from "@/lib/money";
import { SALE_TENDER_LABELS, SALE_TENDERS, settleTender, type SaleTenderCode, type TenderLine } from "@/lib/pos";
import { cashSuggestions, pressKey, tenderProgress } from "@/lib/pos-till";
import { cn } from "@/lib/utils";
import { CreditCustomerPicker } from "./credit-customer-picker";
import { Keypad } from "./keypad";
import type { CreditCustomers } from "./use-credit-customers";

const METHOD_ICONS: Record<SaleTenderCode, typeof Banknote> = { CASH: Banknote, MOMO: Smartphone, CARD: CreditCard, CREDIT: BookUser };

interface TenderDialogProps {
  open: boolean;
  /** The method chosen in the sale before opening; cash when Charge was pressed. */
  initialMethod: SaleTenderCode;
  totalMinor: number;
  credit: CreditCustomers;
  onOpenChange: (open: boolean) => void;
  onComplete: (tenders: TenderLine[], creditCustomer: TillCreditCustomer | null) => void;
}

/** Takes payment: cash with change, mobile money and card for exact amounts, on a customer's account, or a split of them. */
export function TenderDialog({ open, initialMethod, totalMinor, credit, onOpenChange, onComplete }: TenderDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? <TenderForm initialMethod={initialMethod} totalMinor={totalMinor} credit={credit} onComplete={onComplete} /> : null}
    </Dialog>
  );
}

/** Why the part on account cannot go through, or null. */
function accountProblem(tenders: readonly TenderLine[], customer: TillCreditCustomer | null): string | null {
  const onAccount = tenders.filter((t) => t.method === "CREDIT").reduce((sum, t) => sum + t.amountMinor, 0);
  if (onAccount === 0) return null;
  if (!customer) return "Choose the customer whose account this goes on.";
  return creditProblem(customer, onAccount);
}

function TenderForm({ initialMethod, totalMinor, credit, onComplete }: Pick<TenderDialogProps, "initialMethod" | "totalMinor" | "credit" | "onComplete">) {
  const [added, setAdded] = useState<TenderLine[]>([]);
  const [method, setMethod] = useState<SaleTenderCode>(initialMethod);
  // Mobile money, card and credit are for the exact amount.
  const [amountText, setAmountText] = useState(() => (initialMethod === "CASH" ? "" : minorToDecimalString(totalMinor)));
  const [reference, setReference] = useState("");
  const [customer, setCustomer] = useState<TillCreditCustomer | null>(null);
  const [showError, setShowError] = useState(false);

  // The chosen customer as the list knows them now, with sales just made counted in.
  const chosen = customer ? (credit.customers.find((c) => c.id === customer.id) ?? customer) : null;
  const due = tenderProgress(totalMinor, added).remainingMinor;
  const amountMinor = parseDecimalToMinor(amountText) ?? 0;
  const current: TenderLine | null = amountMinor > 0 ? { method, amountMinor, reference: method === "CREDIT" ? null : reference.trim() || null } : null;
  const tenders = current ? [...added, current] : added;
  const settlement = settleTender(totalMinor, tenders);
  const creditError = accountProblem(tenders, chosen);
  const problem = !settlement.ok ? settlement.error : creditError;
  const progress = tenderProgress(totalMinor, tenders);
  const canSplit = current !== null && current.amountMinor < due && added.length < SALE_TENDERS.length - 1;

  function startEntry(next: SaleTenderCode, remainingMinor: number) {
    setMethod(next);
    setReference("");
    setShowError(false);
    // Mobile money, card and credit are for an exact amount, usually what is left to pay.
    setAmountText(next === "CASH" ? "" : minorToDecimalString(remainingMinor));
  }

  function addPart() {
    if (!current || !canSplit) return;
    if ((current.method === "MOMO" && !current.reference) || (current.method === "CREDIT" && accountProblem([current], chosen))) {
      setShowError(true);
      return;
    }
    const nextAdded = [...added, current];
    setAdded(nextAdded);
    const free = SALE_TENDERS.find((m) => !nextAdded.some((t) => t.method === m)) ?? "CASH";
    startEntry(free, tenderProgress(totalMinor, nextAdded).remainingMinor);
  }

  function removePart(remove: SaleTenderCode) {
    const nextAdded = added.filter((t) => t.method !== remove);
    setAdded(nextAdded);
    startEntry(remove, tenderProgress(totalMinor, nextAdded).remainingMinor);
  }

  function complete(event: FormEvent) {
    event.preventDefault();
    if (problem === null) onComplete(tenders, tenders.some((t) => t.method === "CREDIT") ? chosen : null);
    else setShowError(true);
  }

  return (
    <DialogContent title="Take payment" className="max-w-2xl p-4">
      <form onSubmit={complete} className="grid gap-4 sm:grid-cols-[1fr_15rem]">
        <div className="min-w-0 space-y-3">
          <div className="rounded-lg bg-brand-900 px-4 py-2 text-white">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/70">{added.length ? "Still to pay" : "Amount due"}</p>
            <p className="font-display text-3xl font-extrabold tabular-nums">{formatMoney(due)}</p>
            {added.length ? <p className="text-xs text-white/70">of {formatMoney(totalMinor)}</p> : null}
          </div>

          {added.length ? (
            <ul className="space-y-1.5" aria-label="Payments taken">
              {added.map((tender) => (
                <li key={tender.method} className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm">
                  <span className="font-semibold">{SALE_TENDER_LABELS[tender.method]}</span>
                  {tender.method === "CREDIT" && chosen ? <span className="truncate text-ink-muted">{chosen.name}</span> : null}
                  {tender.reference ? <span className="truncate text-ink-muted">{tender.reference}</span> : null}
                  <span className="ml-auto font-semibold tabular-nums">{formatMoney(tender.amountMinor)}</span>
                  <Button variant="ghost" size="icon-sm" aria-label={`Remove the ${SALE_TENDER_LABELS[tender.method].toLowerCase()} payment`} onClick={() => removePart(tender.method)}>
                    <X />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}

          <div role="group" aria-label="Payment method" className="grid grid-cols-4 gap-2">
            {SALE_TENDERS.map((code) => {
              const Icon = METHOD_ICONS[code];
              const used = added.some((t) => t.method === code);
              return (
                <button
                  key={code}
                  type="button"
                  aria-pressed={method === code}
                  disabled={used}
                  onClick={() => startEntry(code, due)}
                  className={cn(
                    "flex flex-col items-center gap-0.5 rounded-lg border px-1 py-2 text-xs font-semibold transition-colors disabled:opacity-40 sm:text-sm",
                    method === code ? "border-brand-600 bg-brand-50 text-brand-800 ring-2 ring-brand-500/30" : "border-line-strong bg-surface hover:bg-soft",
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  {SALE_TENDER_LABELS[code]}
                </button>
              );
            })}
          </div>

          {method === "CREDIT" ? <CreditCustomerPicker credit={credit} chosen={chosen} onChoose={setCustomer} /> : null}

          <div>
            <label htmlFor="till-amount" className="mb-1 block text-sm font-semibold">
              {method === "CASH" ? "Cash received" : method === "CREDIT" ? "Put on account" : "Amount"}
            </label>
            <Input
              id="till-amount"
              autoFocus={method !== "CREDIT"}
              autoComplete="off"
              inputMode="decimal"
              placeholder="0.00"
              value={amountText}
              onChange={(event) => setAmountText(event.target.value.replace(/[^\d.]/g, ""))}
              className="h-12 text-2xl font-bold tabular-nums"
            />
          </div>

          {method === "CASH" ? (
            <div role="group" className="flex flex-wrap gap-2" aria-label="Quick cash amounts">
              {cashSuggestions(due).map((amount) => (
                <Button key={amount} variant="outline" onClick={() => setAmountText(minorToDecimalString(amount))}>
                  {amount === due ? "Exact" : formatMoney(amount)}
                </Button>
              ))}
            </div>
          ) : method === "CREDIT" ? null : (
            <div>
              <label htmlFor="till-reference" className="mb-1 block text-sm font-semibold">
                {method === "MOMO" ? "Transaction ID" : "Approval code (optional)"}
              </label>
              <Input
                id="till-reference"
                autoComplete="off"
                maxLength={60}
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                aria-invalid={showError && method === "MOMO" && !reference.trim()}
                placeholder={method === "MOMO" ? "From the payment message" : "From the card machine slip"}
              />
            </div>
          )}

          <div aria-live="polite" className="min-h-12">
            {progress.changeMinor > 0 && problem === null ? (
              <div className="rounded-lg bg-gold-100 px-4 py-2 text-gold-700">
                <p className="text-xs font-semibold uppercase tracking-wider">Change to give</p>
                <p className="font-display text-2xl font-extrabold tabular-nums text-brand-900">{formatMoney(progress.changeMinor)}</p>
              </div>
            ) : showError && problem ? (
              <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
                {problem}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Keypad decimals className="hidden sm:grid" onKey={(key) => setAmountText((value) => pressKey(value, key, 2))} />
          <Button variant="outline" size="lg" disabled={!canSplit} onClick={addPart}>
            Add as part payment
          </Button>
          <Button type="submit" size="lg" className="h-14 text-base" disabled={!current && !settlement.ok}>
            Complete sale
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}
