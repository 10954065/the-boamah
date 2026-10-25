"use server";

import { revalidatePath } from "next/cache";
import { ok, type ActionResult } from "@/lib/action-result";
import { mergeGuestCart } from "@/server/cart";
import { getCurrentUser, runAction } from "@/server/session";

/** Called right after sign-in / sign-up so a guest cart is not lost. */
export async function mergeGuestCartAfterSignIn(): Promise<ActionResult> {
  return runAction("account.mergeCart", async () => {
    const user = await getCurrentUser();
    if (user) await mergeGuestCart(user.id);
    revalidatePath("/", "layout");
    return ok(undefined);
  });
}
