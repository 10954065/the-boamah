import Link from "next/link";
import { AdminHeader } from "@/components/admin/ui";
import { ReviewModeration } from "@/components/admin/review-moderation";
import { Stars } from "@/components/store/stars";
import { Badge } from "@/components/ui/badge";
import type { ReviewStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { cn, formatDateTime } from "@/lib/utils";
import { requireStaffPage } from "@/server/session";

export const metadata = { title: "Reviews" };

const TABS: { status: ReviewStatus; label: string }[] = [
  { status: "PENDING", label: "Waiting for approval" },
  { status: "APPROVED", label: "Published" },
  { status: "REJECTED", label: "Rejected" },
];

function isReviewStatus(value: unknown): value is ReviewStatus {
  return TABS.some((tab) => tab.status === value);
}

export default async function ReviewsPage({ searchParams }: PageProps<"/admin/reviews">) {
  await requireStaffPage("reviews:manage", "/admin/reviews");
  const params = await searchParams;
  const status: ReviewStatus = isReviewStatus(params.status) ? params.status : "PENDING";
  const [reviews, counts] = await Promise.all([
    prisma.review.findMany({
      where: { status },
      orderBy: { createdAt: status === "PENDING" ? "asc" : "desc" },
      take: 100,
      include: {
        product: { select: { name: true, slug: true } },
        user: { select: { email: true } },
        order: { select: { id: true, reference: true } },
      },
    }),
    prisma.review.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const countFor = (s: ReviewStatus) => counts.find((c) => c.status === s)?._count._all ?? 0;

  return (
    <>
      <AdminHeader
        title="Reviews"
        description="Only customers whose order was delivered can review a product. Nothing appears in the store until you approve it."
      />
      <nav aria-label="Review status" className="mb-5 flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <Link
            key={tab.status}
            href={`/admin/reviews?status=${tab.status}`}
            aria-current={tab.status === status ? "page" : undefined}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
              tab.status === status ? "border-brand-700 bg-brand-700 text-white" : "border-line bg-surface text-ink hover:border-brand-400",
            )}
          >
            {tab.label} <span className="tabular-nums opacity-80">({countFor(tab.status)})</span>
          </Link>
        ))}
      </nav>

      {reviews.length === 0 ? (
        <p className="rounded-lg border border-line bg-surface p-6 text-sm text-ink-muted">
          {status === "PENDING" ? "No reviews are waiting. New ones will show up here." : "Nothing here yet."}
        </p>
      ) : (
        <ul className="space-y-3">
          {reviews.map((review) => (
            <li key={review.id} className="rounded-lg border border-line bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/products/${review.product.slug}`} target="_blank" className="text-sm font-semibold text-brand-700 hover:underline">
                    {review.product.name} ↗
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Stars rating={review.rating} size="sm" />
                    {review.title ? <p className="font-semibold">{review.title}</p> : null}
                  </div>
                </div>
                <ReviewModeration id={review.id} status={review.status} />
              </div>
              <p className="mt-3 whitespace-pre-line text-sm leading-6 text-ink">{review.body}</p>
              <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
                <span>
                  <span className="font-semibold text-ink">{review.authorName}</span> · {review.user.email}
                </span>
                {review.order ? (
                  <Link href={`/admin/orders/${review.order.id}`} className="font-mono text-brand-700 hover:underline">
                    {review.order.reference}
                  </Link>
                ) : null}
                <span>{formatDateTime(review.updatedAt)}</span>
                {review.moderatedAt ? <Badge tone="neutral">Checked {formatDateTime(review.moderatedAt)}</Badge> : null}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
