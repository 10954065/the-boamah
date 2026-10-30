import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface PaginationProps {
  page: number;
  totalPages: number;
  /** Builds the href for a page while preserving other query params. */
  hrefFor: (page: number) => string;
  className?: string;
}

function pageWindow(page: number, total: number): (number | "gap")[] {
  const pages = new Set([1, total, page - 1, page, page + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const result: (number | "gap")[] = [];
  for (const p of sorted) {
    const prev = result[result.length - 1];
    if (typeof prev === "number" && p - prev > 1) result.push("gap");
    result.push(p);
  }
  return result;
}

const itemClass =
  "group inline-flex h-10 min-w-10 items-center justify-center rounded-lg border px-2 text-sm font-semibold tabular-nums transition-colors duration-200";
const idleClass = "border-line bg-surface text-ink hover:border-brand-400 hover:bg-brand-50 hover:text-brand-800";

export function Pagination({ page, totalPages, hrefFor, className }: PaginationProps) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Pagination" className={cn("flex items-center justify-center gap-1.5", className)}>
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} className={cn(itemClass, idleClass)} aria-label="Previous page">
          <ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" aria-hidden="true" />
        </Link>
      ) : null}
      {pageWindow(page, totalPages).map((item, index) =>
        item === "gap" ? (
          <span key={`gap-${index}`} className="px-1 text-ink-subtle" aria-hidden="true">
            …
          </span>
        ) : (
          <Link
            key={item}
            href={hrefFor(item)}
            aria-current={item === page ? "page" : undefined}
            className={cn(
              itemClass,
              item === page
                ? "border-brand-700 bg-brand-700 text-white"
                : idleClass,
            )}
          >
            {item}
          </Link>
        ),
      )}
      {page < totalPages ? (
        <Link href={hrefFor(page + 1)} className={cn(itemClass, idleClass)} aria-label="Next page">
          <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
      ) : null}
    </nav>
  );
}
