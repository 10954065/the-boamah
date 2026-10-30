"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import type { TillCreditCustomer } from "@/lib/credit";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { failureOf, tillOnlineApi } from "./till-api";
import { matchCustomers, type CreditCustomers } from "./use-credit-customers";

/** "Owes GH₵120.00 · limit GH₵500.00" for a customer. */
export function standingText(customer: TillCreditCustomer): string {
  const owes = customer.balanceMinor > 0 ? `Owes ${formatMoney(customer.balanceMinor)}` : "Owes nothing";
  if (!customer.isActive) return `${owes} · credit stopped`;
  return customer.limitMinor === null ? owes : `${owes} · limit ${formatMoney(customer.limitMinor)}`;
}

/** Enter in a field inside the payment form would complete the sale; here it runs the field's own action instead. */
function onEnter(action: () => void) {
  return (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    action();
  };
}

function NewCustomerFields({ credit, onAdded, onCancel }: { credit: CreditCustomers; onAdded: (customer: TillCreditCustomer) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await tillOnlineApi.addCreditCustomer({ name, phone });
      if (result.status === "rejected") setError(result.error);
      else {
        credit.remember(result.customer);
        onAdded(result.customer);
      }
    } catch (failure) {
      setError(failureOf(failure).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-line bg-soft/60 p-3">
      <p className="text-sm font-semibold">New credit customer</p>
      <div>
        <label htmlFor="credit-new-name" className="mb-1 block text-xs font-semibold">
          Full name
        </label>
        <Input id="credit-new-name" autoFocus autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={onEnter(() => void add())} />
      </div>
      <div>
        <label htmlFor="credit-new-phone" className="mb-1 block text-xs font-semibold">
          Phone number
        </label>
        <Input id="credit-new-phone" type="tel" inputMode="tel" autoComplete="off" placeholder="024 123 4567" value={phone} onChange={(e) => setPhone(e.target.value)} onKeyDown={onEnter(() => void add())} />
      </div>
      {error ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={busy} onClick={() => void add()}>
          {busy ? <Spinner label="Adding" /> : null} Add customer
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <p className="text-xs text-ink-muted">Needs the internet. A manager can set a credit limit in the admin.</p>
    </div>
  );
}

interface CreditCustomerPickerProps {
  credit: CreditCustomers;
  chosen: TillCreditCustomer | null;
  onChoose: (customer: TillCreditCustomer | null) => void;
  /** Customers whose credit was stopped can still be picked, e.g. to take a payment. */
  allowStopped?: boolean;
}

/** Finds a credit customer by name or phone, or adds a new one. */
export function CreditCustomerPicker({ credit, chosen, onChoose, allowStopped = false }: CreditCustomerPickerProps) {
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const { refresh } = credit;
  const matches = matchCustomers(credit.customers, query);

  useEffect(() => {
    // Balances may have changed since the list was loaded; offline the stored list is used.
    if (navigator.onLine) void refresh();
  }, [refresh]);

  if (chosen) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-brand-300 bg-brand-50 px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{chosen.name}</p>
          <p className="text-xs text-ink-muted">
            {chosen.phone} · {standingText(chosen)}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => onChoose(null)}>
          Change
        </Button>
      </div>
    );
  }

  if (adding) {
    return (
      <NewCustomerFields
        credit={credit}
        onCancel={() => setAdding(false)}
        onAdded={(customer) => {
          setAdding(false);
          onChoose(customer);
        }}
      />
    );
  }

  const choose = (customer: TillCreditCustomer | undefined) => {
    if (customer && (customer.isActive || allowStopped)) onChoose(customer);
  };
  return (
    <div className="space-y-2">
      <label htmlFor="credit-search" className="block text-sm font-semibold">
        Customer
      </label>
      <Input
        id="credit-search"
        autoComplete="off"
        placeholder="Name or phone number"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onEnter(() => choose(matches[0]))}
      />
      <ul aria-label="Matching customers" className="max-h-48 space-y-1 overflow-y-auto">
        {matches.map((customer) => {
          const usable = customer.isActive || allowStopped;
          return (
            <li key={customer.id}>
              <button
                type="button"
                disabled={!usable}
                onClick={() => choose(customer)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md border border-line px-3 py-2 text-left text-sm transition-colors hover:border-brand-300 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{customer.name}</span>
                  <span className="block text-xs text-ink-muted">{customer.phone}</span>
                </span>
                <span className="shrink-0 text-xs font-semibold tabular-nums text-ink-muted">{standingText(customer)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {matches.length === 0 ? (
        <p className="text-sm text-ink-muted">{credit.customers.length === 0 ? "No credit customers yet." : "Nobody matches. Check the spelling or the number."}</p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(true)}>
          <UserPlus /> New customer
        </Button>
        <p role="status" className="text-xs text-ink-muted">
          {credit.loading ? "Checking balances…" : credit.error ? `Using the list from this till: ${credit.error}` : null}
        </p>
      </div>
    </div>
  );
}
