import { formatMoney } from "@/lib/money";
import { UNIT_INFO, type SellingUnitCode } from "@/lib/quantity";
import { cn } from "@/lib/utils";

interface PriceProps {
  priceMinor: number;
  effectivePriceMinor: number;
  unit?: SellingUnitCode;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/** Current price, with the previous price struck through when discounted. */
export function Price({ priceMinor, effectivePriceMinor, unit, size = "md", className }: PriceProps) {
  const onSale = effectivePriceMinor < priceMinor;
  return (
    <div className={cn("flex flex-wrap items-baseline gap-x-2 gap-y-0.5", className)}>
      <span
        className={cn(
          "font-display font-bold tabular-nums",
          onSale ? "text-sale" : "text-ink",
          size === "sm" && "text-[15px]",
          size === "md" && "text-base",
          size === "lg" && "text-2xl",
        )}
      >
        {formatMoney(effectivePriceMinor)}
      </span>
      {onSale ? (
        <span className={cn("tabular-nums text-ink-subtle line-through", size === "lg" ? "text-base" : "text-xs")}>
          <span className="sr-only">Was </span>
          {formatMoney(priceMinor)}
        </span>
      ) : null}
      {unit ? <span className={cn("text-ink-muted", size === "lg" ? "text-sm" : "text-xs")}>{UNIT_INFO[unit].per}</span> : null}
    </div>
  );
}
