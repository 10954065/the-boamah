"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, fromZod, ok, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { ghanaPhone } from "@/lib/validation";
import { authorizeCustomer, runAction } from "@/server/session";

const profileSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name.").max(80),
  phone: z.union([z.literal(""), ghanaPhone]),
});

/** Customers may edit only their own name and phone — never role or status. */
export async function updateProfile(input: z.input<typeof profileSchema>): Promise<ActionResult> {
  return runAction("profile.update", async () => {
    const user = await authorizeCustomer();
    const parsed = profileSchema.safeParse(input);
    if (!parsed.success) return fromZod(parsed.error);
    await prisma.user.update({
      where: { id: user.id },
      data: { name: parsed.data.name, phone: parsed.data.phone || null },
    });
    revalidatePath("/account", "layout");
    return ok(undefined, "Your details have been saved.");
  });
}

const addressSchema = z.object({
  id: z.string().max(64).optional(),
  label: z.string().trim().max(40).optional(),
  recipientName: z.string().trim().min(2, "Enter the recipient's name.").max(80),
  phone: ghanaPhone,
  zoneId: z.string().max(64).optional(),
  city: z.string().trim().min(2, "Enter the town or city.").max(80),
  area: z.string().trim().min(2, "Enter the area or neighbourhood.").max(80),
  addressLine: z.string().trim().min(3, "Enter a street address or landmark.").max(200),
  details: z.string().trim().max(200).optional(),
  isDefault: z.boolean().optional(),
});

export type AddressInput = z.input<typeof addressSchema>;

export async function saveAddress(input: AddressInput): Promise<ActionResult> {
  return runAction("address.save", async () => {
    const user = await authorizeCustomer();
    const parsed = addressSchema.safeParse(input);
    if (!parsed.success) return fromZod(parsed.error);
    const { id, isDefault, zoneId, ...fields } = parsed.data;

    const zone = zoneId ? await prisma.deliveryZone.findFirst({ where: { id: zoneId, isActive: true } }) : null;
    if (zoneId && !zone) return fail("Please choose a delivery area from the list.");

    await prisma.$transaction(async (tx) => {
      const count = await tx.address.count({ where: { userId: user.id } });
      const makeDefault = Boolean(isDefault) || count === 0;
      if (makeDefault) await tx.address.updateMany({ where: { userId: user.id, isDefault: true }, data: { isDefault: false } });
      const data = {
        ...fields,
        label: fields.label || null,
        details: fields.details || null,
        zoneId: zone?.id ?? null,
        region: zone?.region ?? "",
        ...(makeDefault ? { isDefault: true } : {}),
      };
      if (id) {
        const updated = await tx.address.updateMany({ where: { id, userId: user.id }, data });
        if (updated.count === 0) throw new Error("ADDRESS_NOT_FOUND");
      } else {
        await tx.address.create({ data: { ...data, userId: user.id, isDefault: makeDefault } });
      }
    });
    revalidatePath("/account/addresses");
    return ok(undefined, "Address saved.");
  });
}

export async function deleteAddress(input: { id: string }): Promise<ActionResult> {
  return runAction("address.delete", async () => {
    const user = await authorizeCustomer();
    const id = z.string().max(64).parse(input.id);
    await prisma.$transaction(async (tx) => {
      const address = await tx.address.findFirst({ where: { id, userId: user.id } });
      if (!address) return;
      await tx.address.delete({ where: { id } });
      if (address.isDefault) {
        const next = await tx.address.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
        if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    });
    revalidatePath("/account/addresses");
    return ok(undefined, "Address removed.");
  });
}

export async function setDefaultAddress(input: { id: string }): Promise<ActionResult> {
  return runAction("address.default", async () => {
    const user = await authorizeCustomer();
    const id = z.string().max(64).parse(input.id);
    const address = await prisma.address.findFirst({ where: { id, userId: user.id } });
    if (!address) return fail("Address not found.");
    await prisma.$transaction([
      prisma.address.updateMany({ where: { userId: user.id, isDefault: true }, data: { isDefault: false } }),
      prisma.address.update({ where: { id }, data: { isDefault: true } }),
    ]);
    revalidatePath("/account/addresses");
    return ok(undefined);
  });
}
