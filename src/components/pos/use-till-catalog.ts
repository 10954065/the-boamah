"use client";

import { useCallback, useEffect, useState } from "react";
import type { PosCatalogItem } from "@/lib/pos-till";
import { failureOf, tillApi } from "./till-api";

/** How often the till fetches prices and stock again while it is on screen. */
const REFRESH_MS = 2 * 60_000;

export interface TillCatalog {
  items: PosCatalogItem[];
  loadedAt: string | null;
  status: "loading" | "ready" | "error";
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * The shop's products for the till. A failed refresh keeps the products
 * already loaded, so the cashier can carry on selling.
 */
export function useTillCatalog(): TillCatalog {
  const [state, setState] = useState<Omit<TillCatalog, "refresh">>({ items: [], loadedAt: null, status: "loading", error: null });

  const refresh = useCallback(
    () =>
      tillApi.catalog().then(
        ({ items, loadedAt }) => setState({ items, loadedAt, status: "ready", error: null }),
        (error: unknown) => {
          const { message } = failureOf(error);
          setState((current) => ({ ...current, status: current.items.length > 0 ? "ready" : "error", error: message }));
        },
      ),
    [],
  );

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return { ...state, refresh };
}
