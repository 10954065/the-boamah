"use client";

import { Minus, Plus } from "lucide-react";
import { formatQuantity, type SellingUnitCode } from "@/lib/quantity";
import { cn } from "@/lib/utils";

interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  stepMilli: number;
  minMilli: number;
  maxMilli: number;
  unit: SellingUnitCode;
  disabled?: boolean;
  size?: "sm" | "md";
  label: string;
}

/** Accessible +/- control that only produces valid quantities (in milli-units). */
export function QuantityStepper({
  value,
  onChange,
  stepMilli,
  minMilli,
  maxMilli,
  unit,
  disabled,
  size = "md",
  label,
}: QuantityStepperProps) {
  const canDecrease = !disabled && value - stepMilli >= minMilli;
  const canIncrease = !disabled && value + stepMilli <= maxMilli;
  const buttonClass = cn(
    "flex items-center justify-center text-ink-muted transition-colors hover:bg-soft hover:text-ink disabled:cursor-not-allowed disabled:opacity-40",
    size === "sm" ? "h-8 w-8" : "h-10 w-10",
  );

  return (
    <div
      role="group"
      aria-label={label}
      className={cn("inline-flex items-center overflow-hidden rounded-md border border-line-strong bg-surface", disabled && "opacity-60")}
    >
      <button
        type="button"
        className={buttonClass}
        onClick={() => onChange(value - stepMilli)}
        disabled={!canDecrease}
        aria-label="Decrease quantity"
      >
        <Minus className="h-4 w-4" />
      </button>
      <output
        aria-live="polite"
        className={cn(
          "min-w-[4.5rem] px-1 text-center font-semibold tabular-nums text-ink",
          size === "sm" ? "text-[13px]" : "text-sm",
        )}
      >
        {formatQuantity(value, unit)}
      </output>
      <button
        type="button"
        className={buttonClass}
        onClick={() => onChange(value + stepMilli)}
        disabled={!canIncrease}
        aria-label="Increase quantity"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
