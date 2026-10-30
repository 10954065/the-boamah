"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { OrderStatusCode } from "@/lib/order-status";
import { packStage, type TillOrder } from "@/lib/pos-orders";
import { failureOf, tillOnlineApi } from "./till-api";

/** How often the till looks for new website orders while it is on screen. */
const REFRESH_MS = 15_000;

export interface WebsiteOrders {
  orders: TillOrder[];
  /** Orders still to pack, the number shown on the button. */
  waiting: number;
  loaded: boolean;
  error: string | null;
  /** Items ticked off, by order. Held here so they survive closing an order and going back to selling. */
  ticked: Readonly<Record<string, readonly string[]>>;
  toggleTick: (orderId: string, lineId: string) => void;
  /** Resolves to whether the order moved; a refusal is shown to the cashier. */
  move: (orderId: string, to: OrderStatusCode) => Promise<boolean>;
}

/** Website orders for the till: arrive by themselves, and each new one is announced. */
export function useWebsiteOrders(): WebsiteOrders {
  const [orders, setOrders] = useState<TillOrder[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticked, setTicked] = useState<Record<string, readonly string[]>>({});
  const seen = useRef<Set<string> | null>(null);

  const show = useCallback((next: TillOrder[]) => {
    const known = seen.current;
    const fresh = known ? next.filter((order) => !known.has(order.id)) : [];
    seen.current = new Set([...(known ?? []), ...next.map((order) => order.id)]);
    setOrders(next);
    setError(null);
    setLoaded(true);
    const first = fresh[0];
    if (first) toast.info(fresh.length === 1 ? `New website order ${first.reference}` : `${fresh.length} new website orders`);
  }, []);

  const refresh = useCallback(
    () =>
      tillOnlineApi.websiteOrders().then(
        (data) => show(data.orders),
        (failure: unknown) => setError(failureOf(failure).message),
      ),
    [show],
  );

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, REFRESH_MS);
    const onReturn = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("online", onReturn);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("online", onReturn);
    };
  }, [refresh]);

  const toggleTick = useCallback((orderId: string, lineId: string) => {
    setTicked((current) => {
      const lines = current[orderId] ?? [];
      return { ...current, [orderId]: lines.includes(lineId) ? lines.filter((id) => id !== lineId) : [...lines, lineId] };
    });
  }, []);

  const move = useCallback(
    async (orderId: string, to: OrderStatusCode) => {
      try {
        show((await tillOnlineApi.moveWebsiteOrder({ orderId, to })).orders);
        return true;
      } catch (failure) {
        toast.error(failureOf(failure).message);
        void refresh();
        return false;
      }
    },
    [refresh, show],
  );

  const waiting = orders.filter((order) => ["to-pack", "packing"].includes(packStage(order.status))).length;
  return { orders, waiting, loaded, error, ticked, toggleTick, move };
}
