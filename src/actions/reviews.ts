"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, fromZod, ok, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { orderReviewSchema, type OrderReviewInput } from "@/lib/order-reviews";
import { recordAudit } from "@/server/audit";
import { createOrderReview } from "@/server/order-reviews";
import { findOrderForTracking, getAccessibleOrder } from "@/server/orders/access";
import { clientIp, rateLimit } from "@/server/rate-limit";
import { invalidateStorefront } from "@/server/storefront-cache";
import { authorize, runAction } from "@/server/session";

const REVIEWS_PER_HOUR = 20;

const REVIEW_REFUSED: Record<"already-reviewed" | "not-delivered" | "not-in-order", string> = {
  "already-reviewed": "You have already reviewed this product for this order.",
  "not-delivered": "You can review your items once the order has been delivered or collected.",
  "not-in-order": "This product is not in this order.",
};

/** A customer's review of a product from their delivered order. It waits for staff approval. */
export async function submitOrderReview(input: OrderReviewInput): Promise<ActionResult> {
  return runAction("orders.review", async () => {
    const parsed = orderReviewSchema.safeParse(input);
    if (!parsed.success) return fromZod(parsed.error);
    if (!(await rateLimit("order-review", await clientIp(), REVIEWS_PER_HOUR, 3600))) {
      return fail("Too many reviews from here. Please try again later.");
    }
    const { reference, token, contact, ...review } = parsed.data;
    const order = contact ? await findOrderForTracking(reference, contact) : await getAccessibleOrder(reference.toUpperCase(), token);
    if (!order) return fail("We couldn't find this order. Open it from your confirmation email, or track it again.");

    const outcome = await createOrderReview(order, review);
    if (outcome !== "created") return fail(REVIEW_REFUSED[outcome]);
    revalidatePath("/admin/reviews");
    return ok(undefined, "Thank you. Your review will show once the shop has checked it.");
  });
}

const moderationSchema = z.object({
  id: z.string().min(1).max(64),
  status: z.enum(["APPROVED", "REJECTED"]),
});

export async function moderateReview(input: z.input<typeof moderationSchema>): Promise<ActionResult> {
  return runAction("admin.moderateReview", async () => {
    const user = await authorize("reviews:manage");
    const parsed = moderationSchema.safeParse(input);
    if (!parsed.success) return fail("Invalid review.");
    const review = await prisma.review.update({
      where: { id: parsed.data.id },
      data: { status: parsed.data.status, moderatedAt: new Date() },
      select: { id: true, product: { select: { slug: true } } },
    });
    await recordAudit({
      actorId: user.id,
      action: parsed.data.status === "APPROVED" ? "review.approve" : "review.reject",
      entityType: "Review",
      entityId: review.id,
    });
    // Approving or rejecting changes the stars shoppers see straight away.
    invalidateStorefront();
    revalidatePath(`/products/${review.product.slug}`);
    revalidatePath("/admin/reviews");
    return ok(undefined, parsed.data.status === "APPROVED" ? "Review published." : "Review rejected.");
  });
}
