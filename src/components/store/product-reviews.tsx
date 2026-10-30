import { BadgeCheck } from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { ReviewSummary } from "@/server/reviews";
import { Stars } from "./stars";

interface ProductReviewsProps {
  summary: ReviewSummary;
}

function Distribution({ summary }: { summary: ReviewSummary }) {
  return (
    <ul className="mt-4 space-y-1.5" aria-label="Ratings breakdown">
      {[5, 4, 3, 2, 1].map((stars) => {
        const count = summary.distribution[stars - 1] ?? 0;
        const share = summary.count ? Math.round((count / summary.count) * 100) : 0;
        return (
          <li key={stars} className="flex items-center gap-2 text-xs text-ink-muted">
            <span className="w-10 shrink-0 tabular-nums">{stars} star</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-soft" aria-hidden="true">
              <span className="block h-full rounded-full bg-gold-500" style={{ width: `${share}%` }} />
            </span>
            <span className="w-8 shrink-0 text-right tabular-nums">{count}</span>
            <span className="sr-only">
              {count} review{count === 1 ? "" : "s"} with {stars} star{stars === 1 ? "" : "s"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Approved reviews with a summary. Nothing shows until a product has one. */
export function ProductReviews({ summary }: ProductReviewsProps) {
  if (summary.count === 0) return null;
  return (
    <section id="reviews" aria-labelledby="reviews-title" className="mt-14 scroll-mt-24">
      <h2 id="reviews-title" className="text-xl font-extrabold">
        Customer reviews
      </h2>
      <div className="mt-5 grid gap-8 lg:grid-cols-[280px_1fr]">
        <div className="rounded-xl border border-line bg-surface p-5 lg:self-start">
          <p className="flex items-end gap-2">
            <span className="font-display text-4xl font-extrabold tabular-nums">{summary.average.toFixed(1)}</span>
            <span className="pb-1 text-sm text-ink-muted">out of 5</span>
          </p>
          <Stars rating={summary.average} size="lg" className="mt-2" />
          <p className="mt-1 text-sm text-ink-muted">
            Based on {summary.count} review{summary.count === 1 ? "" : "s"}
          </p>
          <Distribution summary={summary} />
        </div>

        <div className="min-w-0 space-y-6">
          {summary.reviews.length > 0 ? (
            <ul className="divide-y divide-line">
              {summary.reviews.map((review) => (
                <li key={review.id} className="py-5 first:pt-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Stars rating={review.rating} size="sm" />
                    {review.title ? <p className="font-semibold text-ink">{review.title}</p> : null}
                  </div>
                  <p className="mt-2 whitespace-pre-line text-[15px] leading-7 text-ink-muted">{review.body}</p>
                  <p className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-ink-subtle">
                    <span className="font-semibold text-ink">{review.authorName}</span>
                    <span className="inline-flex items-center gap-1 text-brand-700">
                      <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" /> Verified purchase
                    </span>
                    <span>{formatDate(review.createdAt)}</span>
                  </p>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </section>
  );
}
