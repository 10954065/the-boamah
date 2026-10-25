"use server";

import { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { runAction } from "@/server/session";

const schema = z.object({
  email: z.email("Please enter a valid email address.").max(254),
  consent: z.literal(true, { error: "Please agree to receive our emails." }),
});

export async function subscribeNewsletter(input: { email: string; consent: boolean }): Promise<ActionResult> {
  return runAction("newsletter.subscribe", async () => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Please check your details.");
    await prisma.newsletterSubscriber.upsert({
      where: { email: parsed.data.email.toLowerCase() },
      update: {},
      create: { email: parsed.data.email.toLowerCase() },
    });
    return ok(undefined, "Thanks — you're subscribed.");
  });
}
