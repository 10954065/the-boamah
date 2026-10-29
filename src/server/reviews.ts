import "server-only";
import { cache } from "react";
import type { ReviewStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { storefrontCached } from "@/server/storefront-cache";
import type { CurrentUser } from "@/server/session";

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

/** The customer's most recent delivered order that contained this product, if any. */
export async function findDeliveredOrderForProduct(userId: string, productId: string): Promise<{ id: string } | null> {
  return prisma.order.findFirst({
    where: { userId, status: "DELIVERED", items: { some: { productId } } },
    orderBy: { deliveredAt: "desc" },
    select: { id: true },
  });
}

export type ReviewEligibility =
  | { state: "SIGNED_OUT" }
  | { state: "NOT_PURCHASED" }
  | { state: "CAN_REVIEW" }
  | { state: "REVIEWED"; status: ReviewStatus; rating: number; title: string | null; body: string };

export async function getReviewEligibility(productId: string, user: CurrentUser | null): Promise<ReviewEligibility> {
  if (!user) return { state: "SIGNED_OUT" };
  const existing = await prisma.review.findUnique({
    where: { productId_userId: { productId, userId: user.id } },
    select: { status: true, rating: true, title: true, body: true },
  });
  if (existing) return { state: "REVIEWED", ...existing };
  return (await findDeliveredOrderForProduct(user.id, productId)) ? { state: "CAN_REVIEW" } : { state: "NOT_PURCHASED" };
}

/** Public display name: first name and last initial, e.g. "Ama B." */
export function reviewAuthorName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Customer";
  const first = parts[0]!;
  const last = parts.length > 1 ? parts.at(-1)! : "";
  return last ? `${first} ${last[0]!.toUpperCase()}.` : first;
}
