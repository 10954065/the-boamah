"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, fromZod, ok, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { parseDecimalToMinor } from "@/lib/money";
import { ORDER_STATUSES } from "@/lib/order-status";
import { parseDecimalToMilli } from "@/lib/quantity";
import { recordAudit } from "@/server/audit";
import { adjustStock, InsufficientStockError } from "@/server/inventory";
import { cancelOrder, OrderActionError, recordCashPayment, updateOrderStatus } from "@/server/orders/lifecycle";
import { authorize, runAction } from "@/server/session";

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

const stockSchema = z.object({
  variantId: z.string().min(1).max(64),
  type: z.enum(["RECEIPT", "ADJUSTMENT", "CORRECTION"]),
  direction: z.enum(["add", "remove"]),
  quantity: z.string().trim(),
  reason: z.string().trim().min(3, "Give a short reason for this change.").max(300),
});

export async function changeStock(input: z.input<typeof stockSchema>): Promise<ActionResult<{ balanceMilli: number }>> {
  return runAction("admin.changeStock", async () => {
    const user = await authorize("inventory:adjust");
    const parsed = stockSchema.safeParse(input);
    if (!parsed.success) return fromZod(parsed.error);
    const amount = parseDecimalToMilli(parsed.data.quantity);
    if (amount === null || amount <= 0) return fail("Please check the highlighted fields.", { quantity: "Enter a quantity greater than zero, e.g. 5 or 2.5." });
    if (parsed.data.type === "RECEIPT" && parsed.data.direction === "remove") return fail("A stock receipt can only add stock.");
    const delta = parsed.data.direction === "add" ? amount : -amount;
    try {
      const balance = await prisma.$transaction(async (tx) => {
        const newBalance = await adjustStock(tx, { variantId: parsed.data.variantId, deltaMilli: delta, type: parsed.data.type, reason: parsed.data.reason, actorId: user.id });
        await recordAudit({ actorId: user.id, action: "inventory.adjust", entityType: "ProductVariant", entityId: parsed.data.variantId, details: { type: parsed.data.type, deltaMilli: delta, reason: parsed.data.reason } }, tx);
        return newBalance;
      });
      revalidatePath("/admin/inventory");
      revalidatePath("/", "layout");
      return ok({ balanceMilli: balance }, "Stock updated.");
    } catch (error) {
      if (error instanceof InsufficientStockError) return fail("Stock cannot go below zero.");
      throw error;
    }
  });
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

function orderFailure(error: unknown): ActionResult<never> | null {
  return error instanceof OrderActionError ? fail(error.message) : null;
}

export async function changeOrderStatus(input: { orderId: string; status: string; note?: string }): Promise<ActionResult> {
  return runAction("admin.orderStatus", async () => {
    const parsed = z.object({ orderId: z.string().max(64), status: z.enum(ORDER_STATUSES), note: z.string().trim().max(500).optional() }).safeParse(input);
    if (!parsed.success) return fail("Invalid status update.");
    const user = await authorize(parsed.data.status === "CANCELLED" ? "orders:cancel" : "orders:update");
    try {
      if (parsed.data.status === "CANCELLED") {
        await cancelOrder({ orderId: parsed.data.orderId, actorId: user.id, reason: parsed.data.note || "Cancelled by staff" });
      } else {
        await updateOrderStatus({ orderId: parsed.data.orderId, to: parsed.data.status, actorId: user.id, note: parsed.data.note });
      }
    } catch (error) {
      const failure = orderFailure(error);
      if (failure) return failure;
      throw error;
    }
    revalidatePath(`/admin/orders/${parsed.data.orderId}`);
    revalidatePath("/admin/orders");
    return ok(undefined, "Order updated.");
  });
}

export async function recordCash(input: { orderId: string; amount: string }): Promise<ActionResult> {
  return runAction("admin.recordCash", async () => {
    const user = await authorize("payments:record");
    const amountMinor = parseDecimalToMinor(input.amount ?? "");
    if (amountMinor === null) return fail("Enter the amount collected, e.g. 152.00.");
    try {
      await recordCashPayment({ orderId: z.string().max(64).parse(input.orderId), actorId: user.id, amountMinor });
    } catch (error) {
      const failure = orderFailure(error);
      if (failure) return failure;
      throw error;
    }
    revalidatePath(`/admin/orders/${input.orderId}`);
    return ok(undefined, "Cash payment recorded.");
  });
}

export async function addOrderNote(input: { orderId: string; body: string }): Promise<ActionResult> {
  return runAction("admin.orderNote", async () => {
    const user = await authorize("orders:update");
    const parsed = z.object({ orderId: z.string().max(64), body: z.string().trim().min(2, "Write a note.").max(1000) }).safeParse(input);
    if (!parsed.success) return fromZod(parsed.error);
    await prisma.orderNote.create({ data: { orderId: parsed.data.orderId, body: parsed.data.body, authorId: user.id } });
    revalidatePath(`/admin/orders/${parsed.data.orderId}`);
    return ok(undefined, "Note added.");
  });
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export async function setCustomerSuspended(input: { userId: string; suspended: boolean }): Promise<ActionResult> {
  return runAction("admin.suspend", async () => {
    const actor = await authorize("customers:suspend");
    const parsed = z.object({ userId: z.string().max(64), suspended: z.boolean() }).safeParse(input);
    if (!parsed.success) return fail("Invalid request.");
    if (parsed.data.userId === actor.id) return fail("You cannot suspend your own account.");
    const target = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
    if (!target) return fail("Customer not found.");
    if (target.role !== "CUSTOMER" && actor.role !== "SUPER_ADMIN") return fail("Only a Super Admin can suspend staff accounts.");
    await prisma.$transaction([
      prisma.user.update({ where: { id: target.id }, data: { status: parsed.data.suspended ? "SUSPENDED" : "ACTIVE" } }),
      // Suspension takes effect immediately: existing sessions are revoked.
      ...(parsed.data.suspended ? [prisma.session.deleteMany({ where: { userId: target.id } })] : []),
    ]);
    await recordAudit({ actorId: actor.id, action: parsed.data.suspended ? "user.suspend" : "user.reactivate", entityType: "User", entityId: target.id });
    revalidatePath(`/admin/customers/${target.id}`);
    revalidatePath("/admin/customers");
    return ok(undefined, parsed.data.suspended ? "Account suspended." : "Account reactivated.");
  });
}

// ---------------------------------------------------------------------------
// Staff & roles (Super Admin only)
// ---------------------------------------------------------------------------

export async function setStaffRole(input: { email: string; role: string }): Promise<ActionResult> {
  return runAction("admin.staffRole", async () => {
    const actor = await authorize("staff:manage");
    const parsed = z
      .object({ email: z.email().trim().toLowerCase(), role: z.enum(["CUSTOMER", "SUPER_ADMIN", "STORE_MANAGER", "INVENTORY_MANAGER", "ORDER_MANAGER"]) })
      .safeParse(input);
    if (!parsed.success) return fail("Enter a valid email and role.");
    const target = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (!target) return fail("No account exists with that email. Ask the person to register first, then assign their role.");
    if (target.id === actor.id) return fail("You cannot change your own role.");
    if (target.role === "SUPER_ADMIN" && parsed.data.role !== "SUPER_ADMIN") {
      const superAdmins = await prisma.user.count({ where: { role: "SUPER_ADMIN", status: "ACTIVE" } });
      if (superAdmins <= 1) return fail("At least one active Super Admin must remain.");
    }
    await prisma.user.update({ where: { id: target.id }, data: { role: parsed.data.role } });
    await recordAudit({ actorId: actor.id, action: "staff.role_change", entityType: "User", entityId: target.id, details: { from: target.role, to: parsed.data.role } });
    revalidatePath("/admin/staff");
    return ok(undefined, `${target.name} is now ${parsed.data.role === "CUSTOMER" ? "a customer (staff access removed)" : parsed.data.role.replace(/_/g, " ").toLowerCase()}.`);
  });
}

// ---------------------------------------------------------------------------
// Promotions: coupons & banners
// ---------------------------------------------------------------------------

const dateField = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (!v) return null;
    const date = new Date(v);
    if (Number.isNaN(date.getTime())) {
      ctx.addIssue({ code: "custom", message: "Enter a valid date." });
      return z.NEVER;
    }
    return date;
  });

const couponSchema = z
  .object({
    id: z.string().max(64).optional(),
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,30}$/, "Use 3 to 30 letters, numbers, hyphens or underscores."),
    description: z.string().trim().max(200).optional(),
    type: z.enum(["PERCENTAGE", "FIXED"]),
    value: z.string().trim(),
    maxDiscount: z.string().trim().optional(),
    minOrder: z.string().trim().optional(),
    scope: z.enum(["ALL", "PRODUCTS", "CATEGORIES"]),
    productIds: z.array(z.string().max(64)).max(200),
    categoryIds: z.array(z.string().max(64)).max(50),
    startsAt: dateField,
    endsAt: dateField,
    usageLimit: z.string().trim().optional(),
    perCustomerLimit: z.string().trim().optional(),
    isActive: z.boolean(),
  })
  .superRefine((d, ctx) => {
    if (d.startsAt && d.endsAt && d.endsAt <= d.startsAt) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "The end must be after the start." });
    if (d.scope === "PRODUCTS" && d.productIds.length === 0) ctx.addIssue({ code: "custom", path: ["productIds"], message: "Choose at least one product." });
    if (d.scope === "CATEGORIES" && d.categoryIds.length === 0) ctx.addIssue({ code: "custom", path: ["categoryIds"], message: "Choose at least one category." });
  });

function optionalInt(value: string | undefined): number | null | "invalid" {
  if (!value) return null;
  return /^\d{1,7}$/.test(value) && Number(value) > 0 ? Number(value) : "invalid";
}

export async function saveCoupon(input: z.input<typeof couponSchema>): Promise<ActionResult> {
  return runAction("admin.saveCoupon", async () => {
    const user = await authorize("promotions:manage");
    const parsed = couponSchema.safeParse(input);
    if (!parsed.success) return fromZod(parsed.error);
    const d = parsed.data;
    const errors: Record<string, string> = {};

    let value: number | null = null;
    if (d.type === "PERCENTAGE") {
      const pct = parseDecimalToMinor(d.value); // "12.5" -> 1250 basis points
      if (pct === null || pct <= 0 || pct > 10000) errors.value = "Enter a percentage between 0.01 and 100.";
      else value = pct;
    } else {
      const amount = parseDecimalToMinor(d.value);
      if (amount === null || amount <= 0) errors.value = "Enter an amount greater than zero.";
      else value = amount;
    }
    const maxDiscount = d.maxDiscount ? parseDecimalToMinor(d.maxDiscount) : null;
    if (d.maxDiscount && maxDiscount === null) errors.maxDiscount = "Enter an amount like 50.00.";
    const minOrder = d.minOrder ? parseDecimalToMinor(d.minOrder) : 0;
    if (minOrder === null) errors.minOrder = "Enter an amount like 100.00.";
    const usageLimit = optionalInt(d.usageLimit);
    if (usageLimit === "invalid") errors.usageLimit = "Enter a whole number.";
    const perCustomerLimit = optionalInt(d.perCustomerLimit);
    if (perCustomerLimit === "invalid") errors.perCustomerLimit = "Enter a whole number.";
    if (Object.keys(errors).length || value === null) return fail("Please check the highlighted fields.", errors);

    const data = {
      code: d.code,
      description: d.description || null,
      type: d.type,
      value,
      maxDiscountMinor: maxDiscount,
      minOrderMinor: minOrder ?? 0,
      scope: d.scope,
      startsAt: d.startsAt,
      endsAt: d.endsAt,
      usageLimit: usageLimit as number | null,
      perCustomerLimit: perCustomerLimit as number | null,
      isActive: d.isActive,
      products: { set: d.scope === "PRODUCTS" ? d.productIds.map((id) => ({ id })) : [] },
      categories: { set: d.scope === "CATEGORIES" ? d.categoryIds.map((id) => ({ id })) : [] },
    };
    try {
      if (d.id) {
        const current = await prisma.coupon.findUnique({ where: { id: d.id } });
        if (current && data.usageLimit !== null && data.usageLimit < current.usedCount) {
          return fail("Please check the highlighted fields.", { usageLimit: `Already used ${current.usedCount} times.` });
        }
        await prisma.coupon.update({ where: { id: d.id }, data });
      } else {
        const { products, categories, ...rest } = data;
        await prisma.coupon.create({ data: { ...rest, products: { connect: products.set }, categories: { connect: categories.set } } });
      }
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "P2002") return fail("Please check the highlighted fields.", { code: "This code already exists." });
      throw error;
    }
    await recordAudit({ actorId: user.id, action: d.id ? "coupon.update" : "coupon.create", entityType: "Coupon", entityId: d.id ?? d.code, details: { code: d.code, isActive: d.isActive } });
    revalidatePath("/admin/coupons");
    return ok(undefined, "Coupon saved.");
  });
}

const bannerSchema = z.object({
  id: z.string().max(64).optional(),
  placement: z.enum(["HERO", "HOME_PROMO"]),
  eyebrow: z.string().trim().max(40).optional(),
  title: z.string().trim().min(3, "Enter a title.").max(90),
  subtitle: z.string().trim().max(200).optional(),
  imageUrl: z.string().min(1, "Upload an image."),
  ctaLabel: z.string().trim().max(30).optional(),
  ctaHref: z
    .string()
    .trim()
    .max(200)
    .optional()
    .refine((v) => !v || (v.startsWith("/") && !v.startsWith("//")), "Links must be pages on this site, e.g. /offers."),
  tone: z.enum(["leaf", "gold", "cream", "brand"]),
  startsAt: dateField,
  endsAt: dateField,
  sortOrder: z.number().int().min(0).max(1000),
  isActive: z.boolean(),
});

export async function saveBanner(input: z.input<typeof bannerSchema>): Promise<ActionResult> {
  return runAction("admin.saveBanner", async () => {
    const user = await authorize("promotions:manage");
    const parsed = bannerSchema.safeParse(input);
    if (!parsed.success) return fromZod(parsed.error);
    const { id, ...d } = parsed.data;
    const { isAllowedImageUrl } = await import("@/server/storage");
    if (!isAllowedImageUrl(d.imageUrl)) return fail("Please check the highlighted fields.", { imageUrl: "Upload an image." });
    const data = { ...d, eyebrow: d.eyebrow || null, subtitle: d.subtitle || null, ctaLabel: d.ctaLabel || null, ctaHref: d.ctaHref || null };
    const banner = id ? await prisma.promoBanner.update({ where: { id }, data }) : await prisma.promoBanner.create({ data });
    await recordAudit({ actorId: user.id, action: id ? "banner.update" : "banner.create", entityType: "PromoBanner", entityId: banner.id });
    revalidatePath("/", "layout");
    return ok(undefined, "Banner saved.");
  });
}

export async function deleteBanner(input: { id: string }): Promise<ActionResult> {
  return runAction("admin.deleteBanner", async () => {
    const user = await authorize("promotions:manage");
    const id = z.string().max(64).parse(input.id);
    await prisma.promoBanner.delete({ where: { id } });
    await recordAudit({ actorId: user.id, action: "banner.delete", entityType: "PromoBanner", entityId: id });
    revalidatePath("/", "layout");
    return ok(undefined, "Banner deleted.");
  });
}

// ---------------------------------------------------------------------------
// Delivery zones
// ---------------------------------------------------------------------------

const zoneSchema = z.object({
  id: z.string().max(64).optional(),
  name: z.string().trim().min(2, "Enter a zone name.").max(60),
  region: z.string().trim().min(2, "Enter the region.").max(60),
  areas: z.string().trim().max(1000),
  fee: z.string().trim(),
  minOrder: z.string().trim().optional(),
  freeFrom: z.string().trim().optional(),
  estimatedDelivery: z.string().trim().max(120).optional(),
  sortOrder: z.number().int().min(0).max(1000),
  isActive: z.boolean(),
});

export async function saveZone(input: z.input<typeof zoneSchema>): Promise<ActionResult> {
  return runAction("admin.saveZone", async () => {
    const user = await authorize("delivery:manage");
    const parsed = zoneSchema.safeParse(input);
    if (!parsed.success) return fromZod(parsed.error);
    const d = parsed.data;
    const fee = parseDecimalToMinor(d.fee);
    const minOrder = d.minOrder ? parseDecimalToMinor(d.minOrder) : 0;
    const freeFrom = d.freeFrom ? parseDecimalToMinor(d.freeFrom) : null;
    const errors: Record<string, string> = {};
    if (fee === null) errors.fee = "Enter the delivery fee, e.g. 20.00.";
    if (minOrder === null) errors.minOrder = "Enter an amount like 50.00.";
    if (d.freeFrom && freeFrom === null) errors.freeFrom = "Enter an amount like 400.00.";
    if (Object.keys(errors).length) return fail("Please check the highlighted fields.", errors);
    const data = {
      name: d.name,
      region: d.region,
      areas: d.areas.split(/[,\n]/).map((a) => a.trim()).filter(Boolean).slice(0, 50),
      feeMinor: fee!,
      minOrderMinor: minOrder!,
      freeDeliveryThresholdMinor: freeFrom,
      estimatedDelivery: d.estimatedDelivery || null,
      sortOrder: d.sortOrder,
      isActive: d.isActive,
    };
    const zone = d.id ? await prisma.deliveryZone.update({ where: { id: d.id }, data }) : await prisma.deliveryZone.create({ data });
    await recordAudit({ actorId: user.id, action: d.id ? "zone.update" : "zone.create", entityType: "DeliveryZone", entityId: zone.id, details: { name: data.name, feeMinor: data.feeMinor, isActive: data.isActive } });
    revalidatePath("/admin/delivery");
    revalidatePath("/policies/delivery");
    return ok(undefined, "Delivery zone saved.");
  });
}

// ---------------------------------------------------------------------------
// Store settings
// ---------------------------------------------------------------------------

const urlField = z
  .string()
  .trim()
  .max(300)
  .optional()
  .refine((v) => !v || /^https:\/\//.test(v), "Use a full https:// link.");

const settingsSchema = z.object({
  storeName: z.string().trim().min(2).max(80),
  tagline: z.string().trim().max(200).optional(),
  contactEmail: z.union([z.literal(""), z.email()]).optional(),
  contactPhone: z.string().trim().max(40).optional(),
  whatsappNumber: z.string().trim().max(40).optional(),
  address: z.string().trim().max(300).optional(),
  businessHours: z.string().trim().max(300).optional(),
  announcementEnabled: z.boolean(),
  announcementText: z.string().trim().max(160).optional(),
  announcementLink: z
    .string()
    .trim()
    .max(200)
    .optional()
    .refine((v) => !v || (v.startsWith("/") && !v.startsWith("//")), "Links must be pages on this site, e.g. /offers."),
  socialFacebook: urlField,
  socialInstagram: urlField,
  socialX: urlField,
  socialTiktok: urlField,
  pickupEnabled: z.boolean(),
  pickupAddress: z.string().trim().max(300).optional(),
  pickupInstructions: z.string().trim().max(500).optional(),
  codEnabled: z.boolean(),
  onlinePaymentEnabled: z.boolean(),
  pendingPaymentTtlMinutes: z.number().int().min(15).max(1440),
  deliveryPolicy: z.string().trim().max(20000).optional(),
  returnsPolicy: z.string().trim().max(20000).optional(),
  privacyPolicy: z.string().trim().max(20000).optional(),
  termsPolicy: z.string().trim().max(20000).optional(),
  notifyAdminEmails: z.string().trim().max(500).optional(),
  notifyOnNewOrder: z.boolean(),
  smsEnabled: z.boolean(),
  isSampleData: z.boolean(),
});

export type SettingsInput = z.input<typeof settingsSchema>;

export async function saveSettings(input: SettingsInput): Promise<ActionResult> {
  return runAction("admin.saveSettings", async () => {
    const user = await authorize("settings:manage");
    const parsed = settingsSchema.safeParse(input);
    if (!parsed.success) return fromZod(parsed.error);
    const blankToNull = Object.fromEntries(
      Object.entries(parsed.data).map(([key, value]) => [key, typeof value === "string" && value === "" ? null : value]),
    ) as typeof parsed.data;
    if (blankToNull.announcementEnabled && !blankToNull.announcementText) {
      return fail("Please check the highlighted fields.", { announcementText: "Write the announcement or switch it off." });
    }
    await prisma.storeSettings.upsert({ where: { id: "default" }, update: blankToNull, create: { id: "default", ...blankToNull } });
    await recordAudit({ actorId: user.id, action: "settings.update", entityType: "StoreSettings", entityId: "default", details: { fields: Object.keys(parsed.data) } });
    revalidatePath("/", "layout");
    return ok(undefined, "Settings saved.");
  });
}
