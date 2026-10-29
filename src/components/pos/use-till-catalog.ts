"use client";

import { useCallback, useEffect, useState } from "react";
import type { PosCatalogItem } from "@/lib/pos-till";
import { failureOf, tillApi } from "./till-api";
import { readSavedCatalog, saveCatalog, warmImages } from "./till-offline";
import { noteContact } from "./till-storage";

/** How often the till fetches prices and stock again while it is on screen. */
const REFRESH_MS = 2 * 60_000;

export interface TillCatalog {
  items: PosCatalogItem[];
  /** When the shop's system sent these prices and stock. */
  loadedAt: string | null;
  status: "loading" | "ready" | "error";
  error: string | null;
  refresh: () => Promise<void>;
}

type CatalogState = Omit<TillCatalog, "refresh">;

/** Keeps whichever product list the shop's system sent last. */
function later(current: CatalogState, next: { items: PosCatalogItem[]; loadedAt: string }): CatalogState {
  if (current.loadedAt && Date.parse(current.loadedAt) >= Date.parse(next.loadedAt)) return current;
  return { ...current, items: next.items, loadedAt: next.loadedAt, status: "ready" };
}

/**
 * The shop's products for the till. The list saved on the device shows
 * straight away (and is all there is offline); a failed refresh keeps the
 * products already loaded, so the cashier can carry on selling.
 */
export function useTillCatalog(tillCode: string): TillCatalog {
  const [state, setState] = useState<CatalogState>({ items: [], loadedAt: null, status: "loading", error: null });

  const refresh = useCallback(
    () =>
      tillApi.catalog().then(
        (data) => {
          noteContact(tillCode, data.loadedAt);
          setState((current) => ({ ...later(current, data), error: null }));
          void saveCatalog(data);
          void warmImages(data.items.flatMap((item) => (item.imageUrl ? [item.imageUrl] : [])));
        },
        (error: unknown) => {
          const { message } = failureOf(error);
          setState((current) => ({ ...current, status: current.items.length > 0 ? "ready" : "error", error: message }));
        },
      ),
    [tillCode],
  );

  useEffect(() => {
    void readSavedCatalog().then((saved) => {
      if (saved) setState((current) => ({ ...later(current, saved), error: current.error }));
    });
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return { ...state, refresh };
}
