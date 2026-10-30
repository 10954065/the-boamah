"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fromZod, ok, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { ghanaPhone } from "@/lib/validation";
import { authorizeSignedIn, runAction } from "@/server/session";

const profileSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name.").max(80),
  phone: z.union([z.literal(""), ghanaPhone]),
});

/** Staff may edit only their own name and phone, never role or status. */
export async function updateProfile(input: z.input<typeof profileSchema>): Promise<ActionResult> {
  return runAction("profile.update", async () => {
    const user = await authorizeSignedIn();
    const parsed = profileSchema.safeParse(input);
    if (!parsed.success) return fromZod(parsed.error);
    await prisma.user.update({
      where: { id: user.id },
      data: { name: parsed.data.name, phone: parsed.data.phone || null },
    });
    revalidatePath("/admin", "layout");
    return ok(undefined, "Your details have been saved.");
  });
}
