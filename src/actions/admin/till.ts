"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, fromZod, ok, type ActionResult } from "@/lib/action-result";
import { markTillReviewed, REVIEW_KINDS } from "@/server/pos/reports";
import { authorize, runAction } from "@/server/session";

const reviewSchema = z.object({
  kind: z.enum(REVIEW_KINDS),
  id: z.string().min(1).max(64),
  note: z.string().trim().max(500),
});

/** A manager has looked at a flagged sale, a refund or a shift's count difference. */
export async function reviewTillItem(input: z.input<typeof reviewSchema>): Promise<ActionResult> {
  return runAction("admin.reviewTillItem", async () => {
    const user = await authorize("pos:manage");
    const parsed = reviewSchema.safeParse(input);
    if (!parsed.success) return fromZod(parsed.error);
    const marked = await markTillReviewed(parsed.data.kind, parsed.data.id, parsed.data.note || null, user.id);
    if (!marked) return fail("This was already marked as looked at.");
    revalidatePath("/admin/till", "layout");
    return ok(undefined, "Marked as looked at.");
  });
}
