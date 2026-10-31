"use client";

import { useState, type FormEvent } from "react";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney, parseDecimalToMinor } from "@/lib/money";
import { pressKey } from "@/lib/pos-till";
import { Keypad } from "./keypad";

/** Starting a shift: the cashier counts the float in the drawer. Resolves to an error message, or null once open. */
export function OpenShiftForm({ cashierName, onOpen }: { cashierName: string; onOpen: (openingFloatMinor: number) => Promise<string | null> }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const amount = text.trim() === "" ? null : parseDecimalToMinor(text);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (amount === null || busy) return;
    setBusy(true);
    setError(await onOpen(amount));
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl border border-line bg-surface p-6 shadow-[var(--shadow-raised)]">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-700">
          <Wallet className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h1 className="font-display text-xl font-extrabold">Start your shift</h1>
          <p className="text-sm text-ink-muted">Welcome, {cashierName.split(" ")[0]}.</p>
        </div>
      </div>
      <div>
        <label htmlFor="opening-float" className="block text-sm font-semibold">
          Cash in the drawer
        </label>
        <p id="opening-float-hint" className="mb-1 text-xs text-ink-muted">
          Count the float you start with. Enter 0 if the drawer is empty.
        </p>
        <Input
          id="opening-float"
          data-keyboard="none"
          autoFocus
          autoComplete="off"
          inputMode="decimal"
          placeholder="0.00"
          aria-describedby="opening-float-hint"
          value={text}
          onChange={(event) => setText(event.target.value.replace(/[^\d.,]/g, ""))}
          className="h-14 text-2xl font-bold tabular-nums"
        />
      </div>
      <Keypad decimals onKey={(key) => setText((value) => pressKey(value, key, 2))} />
      {error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="lg" className="h-14 w-full text-base" disabled={amount === null || busy}>
        {busy ? "Opening the till" : amount === null ? "Open the till" : `Open the till with ${formatMoney(amount)}`}
      </Button>
    </form>
  );
}
