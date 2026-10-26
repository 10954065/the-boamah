"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, fromZod, ok, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/server/audit";
import { clientIp, rateLimit } from "@/server/rate-limit";
import { findDeliveredOrderForProduct, reviewAuthorName } from "@/server/reviews";
import { authorize, authorizeCustomer, runAction } from "@/server/session";

const reviewSchema = z.object({
  productId: z.string().min(1).max(64),
  rating: z.number().int().min(1, "Choose a star rating.").max(5),
  title: z.string().trim().max(80, "Keep the title under 80 characters.").optional(),
  body: z.string().trim().min(10, "Tell other shoppers a little more (at least 10 characters).").max(2000, "Keep it under 2000 characters."),
});

/**
 * A customer reviews a product they have received. Editing a review sends it
 * back for approval, so nothing is published without a staff check.
 */
export async function submitReview(input: z.input<typeof reviewSchema>): Promise<ActionResult> {
  return runAction("review.submit", async () => {
    const user = await authorizeCustomer();
    const parsed = reviewSchema.safeParse(input);
    if (!parsed.success) return fromZod(parsed.error);
    if (!(await rateLimit("review", `${user.id}:${await clientIp()}`, 10, 3600))) {
      return fail("Too many reviews in a short time. Please try again later.");
    }

    const product = await prisma.product.findFirst({ where: { id: parsed.data.productId, status: "PUBLISHED" }, select: { id: true, slug: true } });
    if (!product) return fail("This product is no longer available.");
    const order = await findDeliveredOrderForProduct(user.id, product.id);
    if (!order) return fail("You can review a product once an order containing it has been delivered.");

    const fields = {
      rating: parsed.data.rating,
      title: parsed.data.title || null,
      body: parsed.data.body,
      authorName: reviewAuthorName(user.name),
      orderId: order.id,
      status: "PENDING" as const,
      moderatedAt: null,
    };
    await prisma.review.upsert({
      where: { productId_userId: { productId: product.id, userId: user.id } },
      update: fields,
      create: { ...fields, productId: product.id, userId: user.id },
    });
    revalidatePath(`/products/${product.slug}`);
    revalidatePath("/admin/reviews");
    return ok(undefined, "Thanks for your review. It will appear once our team has checked it.");
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
    revalidatePath(`/products/${review.product.slug}`);
    revalidatePath("/admin/reviews");
    return ok(undefined, parsed.data.status === "APPROVED" ? "Review published." : "Review rejected.");
  });
}
