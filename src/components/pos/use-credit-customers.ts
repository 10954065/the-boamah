"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { unsentCredit, type TillCreditCustomer } from "@/lib/credit";
import type { OutboxEntry } from "@/lib/pos-outbox";
import { failureOf, tillOnlineApi } from "./till-api";
import { loadCreditList, loadOutbox, saveCreditList, subscribeToTill, type StoredCreditList } from "./till-storage";

const NO_LIST: StoredCreditList = { loadedAt: null, customers: [] };
const NO_ENTRIES: OutboxEntry[] = [];

export interface CreditCustomers {
  /** Every customer with what they owe, counting sales on account still waiting on this till. */
  customers: TillCreditCustomer[];
  loadedAt: string | null;
  loading: boolean;
  error: string | null;
  /** Loads the list and balances again from the shop's system (needs the internet). */
  refresh: () => Promise<void>;
  /** Adds a customer just created at the till to the stored list. */
  remember: (customer: TillCreditCustomer) => void;
}

/** The credit customers the till keeps on the device, so it can sell on account offline. */
export function useCreditCustomers(tillCode: string): CreditCustomers {
  const stored = useSyncExternalStore(subscribeToTill, () => loadCreditList(tillCode), () => NO_LIST);
  const outbox = useSyncExternalStore(subscribeToTill, () => loadOutbox(tillCode), () => NO_ENTRIES);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const customers = useMemo(() => {
    const waiting = unsentCredit(outbox.flatMap((entry) => (entry.kind === "sale" ? [entry] : [])));
    return stored.customers.map((customer) => ({ ...customer, balanceMinor: customer.balanceMinor + (waiting.get(customer.id) ?? 0) }));
  }, [stored, outbox]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await tillOnlineApi.creditCustomers();
      saveCreditList(tillCode, result.customers, result.serverTime);
      setError(null);
    } catch (failure) {
      setError(failureOf(failure).message);
    } finally {
      setLoading(false);
    }
  }, [tillCode]);

  const remember = useCallback(
    (customer: TillCreditCustomer) => {
      const current = loadCreditList(tillCode);
      const others = current.customers.filter((c) => c.id !== customer.id);
      saveCreditList(tillCode, [...others, customer].toSorted((a, b) => a.name.localeCompare(b.name)), current.loadedAt ?? new Date().toISOString());
    },
    [tillCode],
  );

  return { customers, loadedAt: stored.loadedAt, loading, error, refresh, remember };
}

/** Customers whose name or phone number matches what was typed, best first. */
export function matchCustomers(customers: readonly TillCreditCustomer[], query: string, limit = 6): TillCreditCustomer[] {
  const text = query.trim().toLowerCase();
  if (!text) return customers.toSorted((a, b) => b.balanceMinor - a.balanceMinor).slice(0, limit);
  const digits = text.replace(/\D/g, "").replace(/^233/, "");
  return customers
    .filter((customer) => customer.name.toLowerCase().includes(text) || (digits.length >= 3 && customer.phone.includes(digits)))
    .toSorted((a, b) => Number(b.name.toLowerCase().startsWith(text)) - Number(a.name.toLowerCase().startsWith(text)) || a.name.localeCompare(b.name))
    .slice(0, limit);
}
