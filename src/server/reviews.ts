import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { storefrontCached } from "@/server/storefront-cache";

export const REVIEWS_SHOWN = 10;

export interface ReviewView {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  authorName: string;
  createdAt: Date;
}

export interface ReviewSummary {
  count: number;
  /** Average to one decimal place; 0 when there are no reviews. */
  average: number;
  /** Number of reviews per star, index 0 = 1 star. */
  distribution: [number, number, number, number, number];
  reviews: ReviewView[];
}

/** Approved reviews only: pending and rejected reviews are never shown publicly. */
export const getReviewSummary = cache((productId: string): Promise<ReviewSummary> => storefrontCached(`reviews:${productId}`, () => loadReviewSummary(productId)));

async function loadReviewSummary(productId: string): Promise<ReviewSummary> {
  const [groups, reviews] = await Promise.all([
    prisma.review.groupBy({ by: ["rating"], where: { productId, status: "APPROVED" }, _count: { _all: true } }),
    prisma.review.findMany({
      where: { productId, status: "APPROVED" },
      orderBy: { createdAt: "desc" },
      take: REVIEWS_SHOWN,
      select: { id: true, rating: true, title: true, body: true, authorName: true, createdAt: true },
    }),
  ]);
  const distribution: ReviewSummary["distribution"] = [0, 0, 0, 0, 0];
  for (const group of groups) {
    if (group.rating >= 1 && group.rating <= 5) distribution[group.rating - 1] = group._count._all;
  }
  const count = distribution.reduce((sum, n) => sum + n, 0);
  const total = distribution.reduce((sum, n, i) => sum + n * (i + 1), 0);
  return { count, average: count ? Math.round((total / count) * 10) / 10 : 0, distribution, reviews };
}
