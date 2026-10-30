"use client";

import { Clock } from "lucide-react";
import { useSyncExternalStore } from "react";
import { cn, formatTimeLeft } from "@/lib/utils";

const TICK_MS = 30_000;

function subscribeClock(onTick: () => void) {
  const timer = window.setInterval(onTick, TICK_MS);
  return () => window.clearInterval(timer);
}

/** The current time rounded down to the tick, so the countdown re-renders twice a minute. */
const clockSnapshot = () => Math.floor(Date.now() / TICK_MS) * TICK_MS;

interface SaleCountdownProps {
  endsAt: string;
  variant?: "badge" | "inline";
  className?: string;
}

/**
 * "Sale ends in 2d 5h". Rendered only in the browser (the server cannot know
 * the visitor's clock) and hidden once the sale is over; the page then shows
 * the regular price on its next load.
 */
export function SaleCountdown({ endsAt, variant = "badge", className }: SaleCountdownProps) {
  const now = useSyncExternalStore(subscribeClock, clockSnapshot, () => null);
  if (now === null) return null;
  const left = formatTimeLeft(new Date(endsAt).getTime() - now);
  if (!left) return null;

  if (variant === "inline") {
    return (
      <p className={cn("flex items-center gap-1 text-[11px] font-semibold text-sale", className)}>
        <Clock className="h-3 w-3" aria-hidden="true" /> Ends in {left}
      </p>
    );
  }
  return (
    <p
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-sale/10 px-3 py-1 text-xs font-bold text-sale ring-1 ring-sale/20",
        className,
      )}
    >
      <Clock className="h-3.5 w-3.5" aria-hidden="true" /> Sale ends in {left}
    </p>
  );
}
