import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface StarsProps {
  /** 0 to 5, fractions allowed. */
  rating: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/** Read-only star rating; partial stars are filled by width. */
export function Stars({ rating, size = "md", className }: StarsProps) {
  const clamped = Math.max(0, Math.min(5, rating));
  const icon = size === "sm" ? "h-3.5 w-3.5" : size === "lg" ? "h-6 w-6" : "h-4.5 w-4.5";
  return (
    <span className={cn("relative inline-flex shrink-0", className)} role="img" aria-label={`${clamped.toFixed(1).replace(/\.0$/, "")} out of 5 stars`}>
      <span className="flex text-line-strong" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} className={cn(icon, "fill-current")} />
        ))}
      </span>
      <span className="absolute inset-y-0 left-0 flex overflow-hidden text-gold-500" style={{ width: `${(clamped / 5) * 100}%` }} aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} className={cn(icon, "shrink-0 fill-current")} />
        ))}
      </span>
    </span>
  );
}
