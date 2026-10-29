"use client";

import { useState, type FormEvent } from "react";
import { Banknote, CreditCard, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatMoney, minorToDecimalString, parseDecimalToMinor } from "@/lib/money";
import { POS_TENDER_LABELS, POS_TENDERS, settleTender, type PosTenderCode, type TenderLine } from "@/lib/pos";
import { cashSuggestions, pressKey, tenderProgress } from "@/lib/pos-till";
import { cn } from "@/lib/utils";
import { Keypad } from "./keypad";

const METHOD_ICONS: Record<PosTenderCode, typeof Banknote> = { CASH: Banknote, MOMO: Smartphone, CARD: CreditCard };

interface TenderDialogProps {
  open: boolean;
  totalMinor: number;
  onOpenChange: (open: boolean) => void;
  onComplete: (tenders: TenderLine[]) => void;
}

/** Takes payment: cash with change, mobile money and card for exact amounts, or a split of them. */
export function TenderDialog({ open, totalMinor, onOpenChange, onComplete }: TenderDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? <TenderForm totalMinor={totalMinor} onComplete={onComplete} /> : null}
    </Dialog>
  );
}

function TenderForm({ totalMinor, onComplete }: Pick<TenderDialogProps, "totalMinor" | "onComplete">) {
  const [added, setAdded] = useState<TenderLine[]>([]);
  const [method, setMethod] = useState<PosTenderCode>("CASH");
  const [amountText, setAmountText] = useState("");
  const [reference, setReference] = useState("");
  const [showError, setShowError] = useState(false);

  const due = tenderProgress(totalMinor, added).remainingMinor;
  const amountMinor = parseDecimalToMinor(amountText) ?? 0;
  const current: TenderLine | null = amountMinor > 0 ? { method, amountMinor, reference: reference.trim() || null } : null;
  const tenders = current ? [...added, current] : added;
  const settlement = settleTender(totalMinor, tenders);
  const progress = tenderProgress(totalMinor, tenders);
  const canSplit = current !== null && current.amountMinor < due && added.length < POS_TENDERS.length - 1;

  function startEntry(next: PosTenderCode, remainingMinor: number) {
    setMethod(next);
    setReference("");
    setShowError(false);
    // Mobile money and card are taken for an exact amount, usually what is left to pay.
    setAmountText(next === "CASH" ? "" : minorToDecimalString(remainingMinor));
  }

  function addPart() {
    if (!current || !canSplit) return;
    if (current.method === "MOMO" && !current.reference) {
      setShowError(true);
      return;
    }
    const nextAdded = [...added, current];
    setAdded(nextAdded);
    const free = POS_TENDERS.find((m) => !nextAdded.some((t) => t.method === m)) ?? "CASH";
    startEntry(free, tenderProgress(totalMinor, nextAdded).remainingMinor);
  }

  function removePart(remove: PosTenderCode) {
    const nextAdded = added.filter((t) => t.method !== remove);
    setAdded(nextAdded);
    startEntry(remove, tenderProgress(totalMinor, nextAdded).remainingMinor);
  }

  function complete(event: FormEvent) {
    event.preventDefault();
    if (settlement.ok) onComplete(tenders);
    else setShowError(true);
  }

  return (
    <DialogContent title="Take payment" className="max-w-2xl">
      <form onSubmit={complete} className="grid gap-5 sm:grid-cols-[1fr_15rem]">
        <div className="min-w-0 space-y-4">
          <div className="rounded-lg bg-brand-900 px-4 py-3 text-white">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/70">{added.length ? "Still to pay" : "Amount due"}</p>
            <p className="font-display text-3xl font-extrabold tabular-nums">{formatMoney(due)}</p>
            {added.length ? <p className="text-xs text-white/70">of {formatMoney(totalMinor)}</p> : null}
          </div>

          {added.length ? (
            <ul className="space-y-1.5" aria-label="Payments taken">
              {added.map((tender) => (
                <li key={tender.method} className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm">
                  <span className="font-semibold">{POS_TENDER_LABELS[tender.method]}</span>
                  {tender.reference ? <span className="truncate text-ink-muted">{tender.reference}</span> : null}
                  <span className="ml-auto font-semibold tabular-nums">{formatMoney(tender.amountMinor)}</span>
                  <Button variant="ghost" size="icon-sm" aria-label={`Remove the ${POS_TENDER_LABELS[tender.method].toLowerCase()} payment`} onClick={() => removePart(tender.method)}>
                    <X />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}

          <div role="group" aria-label="Payment method" className="grid grid-cols-3 gap-2">
            {POS_TENDERS.map((code) => {
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
                    "flex flex-col items-center gap-1 rounded-lg border px-2 py-3 text-sm font-semibold transition-colors disabled:opacity-40",
                    method === code ? "border-brand-600 bg-brand-50 text-brand-800 ring-2 ring-brand-500/30" : "border-line-strong bg-surface hover:bg-soft",
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  {POS_TENDER_LABELS[code]}
                </button>
              );
            })}
          </div>

          <div>
            <label htmlFor="till-amount" className="mb-1 block text-sm font-semibold">
              {method === "CASH" ? "Cash received" : "Amount"}
            </label>
            <Input
              id="till-amount"
              autoFocus
              autoComplete="off"
              inputMode="decimal"
              placeholder="0.00"
              value={amountText}
              onChange={(event) => setAmountText(event.target.value.replace(/[^\d.]/g, ""))}
              className="h-14 text-2xl font-bold tabular-nums"
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
          ) : (
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
            {progress.changeMinor > 0 && settlement.ok ? (
              <div className="rounded-lg bg-gold-100 px-4 py-2 text-gold-700">
                <p className="text-xs font-semibold uppercase tracking-wider">Change to give</p>
                <p className="font-display text-2xl font-extrabold tabular-nums text-brand-900">{formatMoney(progress.changeMinor)}</p>
              </div>
            ) : showError && !settlement.ok ? (
              <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
                {settlement.error}
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
