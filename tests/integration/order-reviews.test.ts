import { beforeEach, describe, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { createOrderReview, reviewableItems } from "@/server/order-reviews";
import { createOrder } from "@/server/orders/checkout";
import { checkoutInput, createCart, createVariant, resetDatabase, settings } from "./factories";

beforeEach(resetDatabase);

/** A placed order for one product, moved to the status a test needs. */
async function orderFor(status: "CONFIRMED" | "DELIVERED") {
  const { product, variant } = await createVariant({ price: 1000, stock: 9000 });
  const cart = await createCart([{ variantId: variant.id, quantityMilli: 2000, seen: 1000 }]);
  const { orderId } = await createOrder(checkoutInput({ expectedTotalMinor: 2000 }), { cartId: cart.id, settings: settings() });
  const order = await prisma.order.update({ where: { id: orderId }, data: { status, customerName: "Ama Boateng" } });
  return { order, productId: product.id };
}

const review = (productId: string) => ({ productId, rating: 5, body: "Cooks well and tastes good." });

describe("reviews from orders", () => {
  test("a delivered order lists its products, and a review waits for approval under the customer's first name and initial", async () => {
    const { order, productId } = await orderFor("DELIVERED");
    expect(await reviewableItems(order)).toEqual([expect.objectContaining({ productId, review: null })]);

    expect(await createOrderReview(order, review(productId))).toBe("created");
    const saved = await prisma.review.findFirstOrThrow({ where: { orderId: order.id } });
    expect(saved).toMatchObject({ productId, rating: 5, status: "PENDING", authorName: "Ama B.", userId: null });
    expect(await reviewableItems(order)).toEqual([expect.objectContaining({ productId, review: { rating: 5, status: "PENDING" } })]);
  });

  test("each product can be reviewed once per order", async () => {
    const { order, productId } = await orderFor("DELIVERED");
    await createOrderReview(order, review(productId));
    expect(await createOrderReview(order, { ...review(productId), rating: 1 })).toBe("already-reviewed");
    expect(await prisma.review.count()).toBe(1);
  });

  test("nothing can be reviewed before delivery, nor a product that was not in the order", async () => {
    const pending = await orderFor("CONFIRMED");
    expect(await reviewableItems(pending.order)).toEqual([]);
    expect(await createOrderReview(pending.order, review(pending.productId))).toBe("not-delivered");

    const delivered = await orderFor("DELIVERED");
    expect(await createOrderReview(delivered.order, review(pending.productId))).toBe("not-in-order");
    expect(await prisma.review.count()).toBe(0);
  });
});
