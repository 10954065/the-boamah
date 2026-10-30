"use client";

import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";

const DIGITS = ["7", "8", "9", "4", "5", "6", "1", "2", "3"];

const KEY_LABELS: Record<string, string> = { back: "Delete last digit", clear: "Clear", ".": "Decimal point" };

interface KeypadProps {
  onKey: (key: string) => void;
  /** Offer a decimal point (money and weights) instead of a clear key. */
  decimals: boolean;
  className?: string;
}

/**
 * Large number keys for touch screens. The keys never take focus, so a
 * physical keyboard or scanner keeps typing into the field.
 */
export function Keypad({ onKey, decimals, className }: KeypadProps) {
  const keys = [...DIGITS, decimals ? "." : "clear", "0", "back"];
  return (
    <div className={cn("grid grid-cols-3 gap-2", className)}>
      {keys.map((key) => (
        <button
          key={key}
          type="button"
          tabIndex={-1}
          aria-label={KEY_LABELS[key] ?? key}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onKey(key)}
          className="h-11 select-none rounded-md border border-line bg-surface text-lg font-semibold tabular-nums text-ink shadow-sm transition-colors hover:bg-soft active:translate-y-px active:bg-brand-50"
        >
          {key === "back" ? <Delete className="mx-auto h-5 w-5" aria-hidden="true" /> : key === "clear" ? "C" : key}
        </button>
      ))}
    </div>
  );
}
