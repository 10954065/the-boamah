import { CircleCheck, Truck } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { freeDeliveryProgress } from "@/lib/pricing";
import { cn } from "@/lib/utils";

export interface FreeDeliveryBarProps {
  /** Goods total after coupon discounts, which is what the free-delivery amount is checked against. */
  goodsTotalMinor: number;
  target: { thresholdMinor: number; zoneName: string };
  className?: string;
}

/** "Add GH₵X more for free delivery" with a progress bar. */
export function FreeDeliveryBar({ goodsTotalMinor, target, className }: FreeDeliveryBarProps) {
  const progress = freeDeliveryProgress(goodsTotalMinor, target.thresholdMinor);
  const where = `in ${target.zoneName}`;
  return (
    <div className={cn("rounded-lg border border-line bg-soft/60 p-3", className)}>
      <p className="flex items-start gap-2 text-sm" aria-live="polite">
        {progress.reached ? (
          <>
            <CircleCheck className="pop mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
            <span className="font-semibold text-brand-800">You have free delivery {where}.</span>
          </>
        ) : (
          <>
            <Truck className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />
            <span>
              Add <strong className="tabular-nums">{formatMoney(progress.remainingMinor)}</strong> more for free delivery {where}.
            </span>
          </>
        )}
      </p>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-label="Progress to free delivery"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percent}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-700 ease-out",
            progress.reached ? "bg-success" : "bg-brand-500",
          )}
          style={{ width: `${progress.percent}%` }}
        />
      </div>
      {!progress.reached ? (
        <p className="mt-1.5 text-xs text-ink-muted">Other areas have their own amounts, shown at checkout.</p>
      ) : null}
    </div>
  );
}
