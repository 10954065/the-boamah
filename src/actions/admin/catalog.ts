"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { fail, fromZod, ok, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { parseDecimalToMinor } from "@/lib/money";
import { parseDecimalToMilli, SELLING_UNITS, UNIT_INFO, type SellingUnitCode } from "@/lib/quantity";
import { slugify } from "@/lib/utils";
import { recordAudit } from "@/server/audit";
import { authorize, runAction } from "@/server/session";
import { isAllowedImageUrl, storeImage, UploadError } from "@/server/storage";

const money = (label: string) =>
  z.string().trim().refine((v) => parseDecimalToMinor(v) !== null, `${label} must be an amount like 12.50.`).transform((v) => parseDecimalToMinor(v)!);
const optionalMoney = (label: string) =>
  z.string().trim().optional().transform((v, ctx) => {
    if (!v) return null;
    const parsed = parseDecimalToMinor(v);
    if (parsed === null) {
      ctx.addIssue({ code: "custom", message: `${label} must be an amount like 12.50.` });
      return z.NEVER;
    }
    return parsed;
  });
const quantity = (label: string) =>
  z.string().trim().refine((v) => parseDecimalToMilli(v) !== null, `${label} must be a number like 1 or 0.5.`).transform((v) => parseDecimalToMilli(v)!);
const optionalQuantity = (label: string) =>
  z.string().trim().optional().transform((v, ctx) => {
    if (!v) return null;
    const parsed = parseDecimalToMilli(v);
    if (parsed === null) {
      ctx.addIssue({ code: "custom", message: `${label} must be a number like 1 or 0.5.` });
      return z.NEVER;
    }
    return parsed;
  });

const MAX_TIERS = 4;

/** "2026-11-30T18:00" from a datetime-local input, read as Ghana time (GMT, no daylight saving). */
const ghanaDateTime = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (!v) return null;
    const date = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) ? new Date(`${v}:00Z`) : null;
    if (!date || Number.isNaN(date.getTime())) {
      ctx.addIssue({ code: "custom", message: "Enter a date and time." });
      return z.NEVER;
    }
    return date;
  });

const tierSchema = z.object({
  minQty: quantity("Bulk quantity"),
  price: money("Bulk price"),
});

const variantSchema = z
  .object({
    id: z.string().max(64).optional(),
    name: z.string().trim().min(1, "Enter a size or option name.").max(60),
    sku: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,40}$/, "SKU must be 3 to 40 letters, numbers or hyphens."),
    unit: z.enum(SELLING_UNITS as [SellingUnitCode, ...SellingUnitCode[]]),
    price: money("Price"),
    salePrice: optionalMoney("Sale price"),
    saleEndsAt: ghanaDateTime,
    step: quantity("Quantity step"),
    min: quantity("Minimum quantity"),
    max: optionalQuantity("Maximum quantity"),
    lowStock: quantity("Low stock level"),
    openingStock: optionalQuantity("Opening stock"),
    isActive: z.boolean(),
    tiers: z.array(tierSchema).max(MAX_TIERS, `Up to ${MAX_TIERS} bulk prices per option.`).default([]),
  })
  .superRefine((v, ctx) => {
    if (v.price <= 0) ctx.addIssue({ code: "custom", path: ["price"], message: "Price must be greater than zero." });
    if (v.salePrice !== null && v.salePrice >= v.price) ctx.addIssue({ code: "custom", path: ["salePrice"], message: "Sale price must be lower than the regular price." });
    if (v.step <= 0 || v.min <= 0) ctx.addIssue({ code: "custom", path: ["step"], message: "Step and minimum must be greater than zero." });
    if (!UNIT_INFO[v.unit].divisible && (v.step % 1000 !== 0 || v.min % 1000 !== 0)) {
      ctx.addIssue({ code: "custom", path: ["step"], message: `${UNIT_INFO[v.unit].plural} can only be sold in whole numbers.` });
    }
    if (v.max !== null && v.max < v.min) ctx.addIssue({ code: "custom", path: ["max"], message: "Maximum must be at least the minimum." });
    const shelfPrice = v.salePrice ?? v.price;
    const seen = new Set<number>();
    v.tiers.forEach((tier, i) => {
      if (tier.minQty <= v.min) {
        ctx.addIssue({ code: "custom", path: ["tiers", i, "minQty"], message: "Bulk quantity must be more than the minimum." });
      } else if (!UNIT_INFO[v.unit].divisible && tier.minQty % 1000 !== 0) {
        ctx.addIssue({ code: "custom", path: ["tiers", i, "minQty"], message: "Use a whole number." });
      } else if (seen.has(tier.minQty)) {
        ctx.addIssue({ code: "custom", path: ["tiers", i, "minQty"], message: "Each bulk quantity must be different." });
      }
      seen.add(tier.minQty);
      if (tier.price <= 0 || tier.price >= shelfPrice) {
        ctx.addIssue({ code: "custom", path: ["tiers", i, "price"], message: "Bulk price must be lower than the shelf price." });
      }
    });
  });

const productSchema = z.object({
  id: z.string().max(64).optional(),
  name: z.string().trim().min(2, "Enter a product name.").max(120),
  slug: z.string().trim().max(80).optional(),
  description: z.string().trim().min(10, "Add a description (at least 10 characters).").max(5000),
  shortDescription: z.string().trim().max(240).optional(),
  searchKeywords: z.string().trim().max(300).optional(),
  categoryId: z.string().min(1, "Choose a category.").max(64),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
  isFeatured: z.boolean(),
  images: z
    .array(z.object({ url: z.string().refine(isAllowedImageUrl, "Unsupported image location."), alt: z.string().trim().max(160) }))
    .max(8, "Up to 8 images."),
  variants: z.array(variantSchema).min(1, "Add at least one size or option.").max(20),
  defaultIndex: z.number().int().min(0),
});

export type ProductFormInput = z.input<typeof productSchema>;

function refresh(): void {
  revalidatePath("/", "layout");
}

export async function saveProduct(input: ProductFormInput): Promise<ActionResult<{ id: string }>> {
  return runAction("admin.saveProduct", async () => {
    const user = await authorize("catalog:edit");
    const parsed = productSchema.safeParse(input);
    if (!parsed.success) return fromZod(parsed.error);
    const data = parsed.data;
    const slug = slugify(data.slug || data.name);
    if (!slug) return fail("Please check the highlighted fields.", { slug: "Enter a URL slug." });

    const category = await prisma.category.findUnique({ where: { id: data.categoryId } });
    if (!category) return fail("Please check the highlighted fields.", { categoryId: "Choose a valid category." });

    try {
      const productId = await prisma.$transaction(async (tx) => {
        const existing = data.id ? await tx.product.findUnique({ where: { id: data.id }, include: { variants: true } }) : null;
        if (data.id && !existing) throw new Error("PRODUCT_NOT_FOUND");
        const base = {
          name: data.name,
          slug,
          description: data.description,
          shortDescription: data.shortDescription || null,
          searchKeywords: data.searchKeywords ?? "",
          categoryId: data.categoryId,
          status: data.status,
          isFeatured: data.isFeatured,
          publishedAt: data.status === "PUBLISHED" ? (existing?.publishedAt ?? new Date()) : (existing?.publishedAt ?? null),
        };
        const product = existing
          ? await tx.product.update({ where: { id: existing.id }, data: base })
          : await tx.product.create({ data: base });

        await tx.productImage.deleteMany({ where: { productId: product.id } });
        if (data.images.length) {
          await tx.productImage.createMany({
            data: data.images.map((image, sortOrder) => ({ productId: product.id, url: image.url, alt: image.alt || data.name, sortOrder })),
          });
        }

        const keptIds = new Set<string>();
        for (const [index, variant] of data.variants.entries()) {
          const fields = {
            name: variant.name,
            sku: variant.sku,
            unit: variant.unit,
            priceMinor: variant.price,
            salePriceMinor: variant.salePrice,
            saleEndsAt: variant.salePrice === null ? null : variant.saleEndsAt,
            stepMilli: variant.step,
            minQtyMilli: variant.min,
            maxQtyMilli: variant.max,
            lowStockMilli: variant.lowStock,
            isActive: variant.isActive,
            isDefault: index === data.defaultIndex,
            sortOrder: index,
          };
          const current = variant.id ? existing?.variants.find((v) => v.id === variant.id) : undefined;
          let variantId: string;
          if (current) {
            await tx.productVariant.update({ where: { id: current.id }, data: fields });
            keptIds.add(current.id);
            variantId = current.id;
            if (
              current.priceMinor !== variant.price ||
              current.salePriceMinor !== variant.salePrice ||
              current.saleEndsAt?.getTime() !== (variant.salePrice === null ? null : variant.saleEndsAt)?.getTime()
            ) {
              await recordAudit(
                {
                  actorId: user.id,
                  action: "variant.price_change",
                  entityType: "ProductVariant",
                  entityId: current.id,
                  details: {
                    from: [current.priceMinor, current.salePriceMinor, current.saleEndsAt?.toISOString() ?? null],
                    to: [variant.price, variant.salePrice, variant.saleEndsAt?.toISOString() ?? null],
                  },
                },
                tx,
              );
            }
          } else {
            const opening = variant.openingStock ?? 0;
            const created = await tx.productVariant.create({ data: { ...fields, productId: product.id, stockMilli: opening } });
            keptIds.add(created.id);
            variantId = created.id;
            if (opening > 0) {
              await tx.inventoryMovement.create({
                data: { variantId: created.id, type: "INITIAL", deltaMilli: opening, balanceAfterMilli: opening, reason: "Opening stock", actorId: user.id },
              });
            }
          }
          await tx.priceTier.deleteMany({ where: { variantId } });
          if (variant.tiers.length) {
            await tx.priceTier.createMany({
              data: variant.tiers.map((tier) => ({ variantId, minQtyMilli: tier.minQty, unitPriceMinor: tier.price })),
            });
          }
        }
        // Removed options are deactivated, not deleted, so order history stays intact.
        await tx.productVariant.updateMany({
          where: { productId: product.id, id: { notIn: [...keptIds] } },
          data: { isActive: false, isDefault: false },
        });

        await recordAudit(
          { actorId: user.id, action: existing ? "product.update" : "product.create", entityType: "Product", entityId: product.id, details: { name: data.name, status: data.status } },
          tx,
        );
        return product.id;
      });
      refresh();
      return ok({ id: productId }, "Product saved.");
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const target = String(error.meta?.target ?? "");
        return fail("Please check the highlighted fields.", target.includes("sku") ? { variants: "Each SKU must be unique." } : { slug: "Another product already uses this URL slug." });
      }
      throw error;
    }
  });
}

/** Deletes a product that has never been ordered; otherwise archives it to preserve history. */
export async function removeProduct(input: { id: string }): Promise<ActionResult<{ archived: boolean }>> {
  return runAction<{ archived: boolean }>("admin.removeProduct", async () => {
    const user = await authorize("catalog:edit");
    const id = z.string().max(64).parse(input.id);
    const ordered = await prisma.orderItem.count({ where: { productId: id } });
    if (ordered > 0) {
      await prisma.product.update({ where: { id }, data: { status: "ARCHIVED", isFeatured: false } });
      await recordAudit({ actorId: user.id, action: "product.archive", entityType: "Product", entityId: id });
      refresh();
      return ok({ archived: true }, "This product has order history, so it was archived instead of deleted.");
    }
    await prisma.product.delete({ where: { id } });
    await recordAudit({ actorId: user.id, action: "product.delete", entityType: "Product", entityId: id });
    refresh();
    return ok({ archived: false }, "Product deleted.");
  });
}

export async function uploadImage(formData: FormData): Promise<ActionResult<{ url: string }>> {
  return runAction("admin.uploadImage", async () => {
    const user = await authorize("catalog:edit");
    const file = formData.get("file");
    const folder = formData.get("folder");
    if (!(file instanceof File)) return fail("Choose an image to upload.");
    const target = folder === "categories" || folder === "banners" ? folder : "products";
    try {
      const url = await storeImage(file, target);
      await recordAudit({ actorId: user.id, action: "image.upload", entityType: "Image", details: { url } });
      return ok({ url });
    } catch (error) {
      if (error instanceof UploadError) return fail(error.message);
      throw error;
    }
  });
}

const categorySchema = z.object({
  id: z.string().max(64).optional(),
  name: z.string().trim().min(2, "Enter a category name.").max(60),
  slug: z.string().trim().max(80).optional(),
  description: z.string().trim().max(300).optional(),
  imageUrl: z.union([z.literal(""), z.string().refine(isAllowedImageUrl, "Unsupported image location.")]).optional(),
  sortOrder: z.number().int().min(0).max(1000),
  isActive: z.boolean(),
});

export async function saveCategory(input: z.input<typeof categorySchema>): Promise<ActionResult> {
  return runAction("admin.saveCategory", async () => {
    const user = await authorize("catalog:edit");
    const parsed = categorySchema.safeParse(input);
    if (!parsed.success) return fromZod(parsed.error);
    const { id, ...data } = parsed.data;
    const fields = {
      name: data.name,
      slug: slugify(data.slug || data.name),
      description: data.description || null,
      imageUrl: data.imageUrl || null,
      sortOrder: data.sortOrder,
      isActive: data.isActive,
    };
    try {
      const category = id ? await prisma.category.update({ where: { id }, data: fields }) : await prisma.category.create({ data: fields });
      await recordAudit({ actorId: user.id, action: id ? "category.update" : "category.create", entityType: "Category", entityId: category.id, details: { name: fields.name, isActive: fields.isActive } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return fail("Please check the highlighted fields.", { slug: "Another category already uses this URL slug." });
      }
      throw error;
    }
    refresh();
    return ok(undefined, "Category saved.");
  });
}

/** Categories that still contain products cannot be deleted — deactivate or move the products first. */
export async function deleteCategory(input: { id: string }): Promise<ActionResult> {
  return runAction("admin.deleteCategory", async () => {
    const user = await authorize("catalog:edit");
    const id = z.string().max(64).parse(input.id);
    const products = await prisma.product.count({ where: { categoryId: id } });
    if (products > 0) {
      return fail(`This category still has ${products} product${products === 1 ? "" : "s"}. Move them to another category or deactivate the category instead.`);
    }
    await prisma.category.delete({ where: { id } });
    await recordAudit({ actorId: user.id, action: "category.delete", entityType: "Category", entityId: id });
    refresh();
    return ok(undefined, "Category deleted.");
  });
}
