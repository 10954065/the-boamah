"use server";

import { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { emailField, ghanaPhone } from "@/lib/validation";
import { clientIp, rateLimit } from "@/server/rate-limit";
import { getCurrentUser, runAction } from "@/server/session";
import { getStoreSettings } from "@/server/settings";

const inputSchema = z.object({
  variantId: z.string().min(1).max(64),
  contact: z.string().trim().min(3).max(254),
});

type Contact = { channel: "EMAIL" | "SMS"; contact: string };

function parseContact(raw: string, smsEnabled: boolean): Contact | { error: string } {
  if (raw.includes("@")) {
    const email = emailField.safeParse(raw);
    return email.success ? { channel: "EMAIL", contact: email.data.toLowerCase() } : { error: "Enter a valid email address." };
  }
  if (!smsEnabled) return { error: "Enter your email address." };
  const phone = ghanaPhone.safeParse(raw);
  if (!phone.success) return { error: "Enter a valid email address or Ghana phone number." };
  // Store one form per number so the same person is not added twice.
  return { channel: "SMS", contact: phone.data.replace(/^\+233/, "0") };
}

/** A shopper asks to be told when an out-of-stock option is back. */
export async function requestStockAlert(input: z.input<typeof inputSchema>): Promise<ActionResult<{ channel: "EMAIL" | "SMS" }>> {
  return runAction("stockAlert.request", async () => {
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) return fail("Enter your email address.");
    if (!(await rateLimit("stock-alert", await clientIp(), 10, 3600))) {
      return fail("Too many requests. Please try again later.");
    }

    const settings = await getStoreSettings();
    const contact = parseContact(parsed.data.contact, settings.smsEnabled);
    if ("error" in contact) return fail(contact.error);

    const variant = await prisma.productVariant.findFirst({
      where: { id: parsed.data.variantId, isActive: true, product: { status: "PUBLISHED", category: { isActive: true } } },
      select: { id: true, stockMilli: true, minQtyMilli: true },
    });
    if (!variant) return fail("This product is no longer available.");
    if (variant.stockMilli >= variant.minQtyMilli) return fail("Good news: this is back in stock now. Refresh the page to order it.");

    const user = await getCurrentUser();
    await prisma.stockAlert.upsert({
      where: { variantId_contact: { variantId: variant.id, contact: contact.contact } },
      update: { notifiedAt: null, userId: user?.id },
      create: { variantId: variant.id, channel: contact.channel, contact: contact.contact, userId: user?.id ?? null },
    });
    const how = contact.channel === "EMAIL" ? "email" : "text";
    return ok({ channel: contact.channel }, `Thanks. We will ${how} you as soon as it is back.`);
  });
}
