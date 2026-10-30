import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { reviewerName, type ReviewableItem } from "@/lib/order-reviews";

/**
 * Reviews from customers' own orders. Only a delivered (or collected) order
 * can be reviewed, once per product, and every review waits for staff to
 * approve it before it shows anywhere.
 */

interface OrderForReview {
  id: string;
  status: string;
  customerName: string;
}

/** The products of a delivered order that still exist, with any review already left for them. Empty before delivery. */
export async function reviewableItems(order: OrderForReview): Promise<ReviewableItem[]> {
  if (order.status !== "DELIVERED") return [];
  const items = await prisma.orderItem.findMany({
    where: { orderId: order.id, product: { isNot: null } },
    select: { productId: true, productName: true, imageUrl: true },
    orderBy: { id: "asc" },
  });
  const firstByProduct = new Map<string, { productName: string; imageUrl: string | null }>();
  for (const item of items) {
    if (item.productId && !firstByProduct.has(item.productId)) firstByProduct.set(item.productId, { productName: item.productName, imageUrl: item.imageUrl });
  }
  if (firstByProduct.size === 0) return [];

  const reviews = await prisma.review.findMany({
    where: { orderId: order.id, productId: { in: [...firstByProduct.keys()] } },
    select: { productId: true, rating: true, status: true },
  });
  const byProduct = new Map(reviews.map((review) => [review.productId, { rating: review.rating, status: review.status }]));
  return [...firstByProduct].map(([productId, item]) => ({ productId, ...item, review: byProduct.get(productId) ?? null }));
}

export type ReviewOutcome = "created" | "already-reviewed" | "not-delivered" | "not-in-order";

export async function createOrderReview(
  order: OrderForReview,
  review: { productId: string; rating: number; title?: string; body: string },
): Promise<ReviewOutcome> {
  if (order.status !== "DELIVERED") return "not-delivered";
  const bought = await prisma.orderItem.count({ where: { orderId: order.id, productId: review.productId } });
  if (bought === 0) return "not-in-order";
  try {
    await prisma.review.create({
      data: {
        productId: review.productId,
        orderId: order.id,
        rating: review.rating,
        title: review.title || null,
        body: review.body,
        authorName: reviewerName(order.customerName),
      },
    });
    return "created";
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return "already-reviewed";
    throw error;
  }
}
