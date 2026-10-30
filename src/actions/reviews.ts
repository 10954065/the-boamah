"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/server/audit";
import { invalidateStorefront } from "@/server/storefront-cache";
import { authorize, runAction } from "@/server/session";

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
