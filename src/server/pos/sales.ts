import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma, type Tx } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { parseReceiptNumber, settleTender, type PosSaleUpload } from "@/lib/pos";
import { unitPriceForQuantity } from "@/lib/pricing";
import { formatQuantity, lineTotalMinor, type SellingUnitCode } from "@/lib/quantity";
import { invalidateStorefront } from "@/server/storefront-cache";

/** The till's clock may run a little fast. */
const CLOCK_SKEW_MS = 10 * 60_000;
/** A till that has been offline longer than this needs a manager to look at its sales. */
const MAX_OFFLINE_MS = 90 * 86_400_000;

export type PosSaleResult =
  | { clientId: string; status: "recorded" | "duplicate"; saleId: string; receiptNumber: string; shortfall: boolean; priceDifference: boolean }
  | { clientId: string; status: "rejected"; error: string };

/** A sale the server will not record as sent; the till keeps it for a manager. */
class PosSaleRejected extends Error {}

const summarySelect = { id: true, receiptNumber: true, hasShortfall: true, hasPriceDifference: true } satisfies Prisma.PosSaleSelect;
type SaleSummary = Prisma.PosSaleGetPayload<{ select: typeof summarySelect }>;

const asResult = (clientId: string, status: "recorded" | "duplicate", sale: SaleSummary): PosSaleResult => ({
  clientId,
  status,
  saleId: sale.id,
  receiptNumber: sale.receiptNumber,
  shortfall: sale.hasShortfall,
  priceDifference: sale.hasPriceDifference,
});

/**
 * Records one sale made at the till. Goods have already left the shop, so a
 * sale is never refused for stock: stock goes down to zero at most and the
 * missing quantity is recorded as a shortfall. Uploading the same sale again
 * returns the sale recorded the first time.
 */
export async function recordPosSale(input: PosSaleUpload, now: Date = new Date()): Promise<PosSaleResult> {
  const existing = await prisma.posSale.findUnique({ where: { clientId: input.clientId }, select: summarySelect });
  if (existing) return asResult(input.clientId, "duplicate", existing);

  try {
    const sale = await prisma.$transaction((tx) => createSale(tx, input, now));
    return asResult(input.clientId, "recorded", sale);
  } catch (error) {
    if (error instanceof PosSaleRejected) return { clientId: input.clientId, status: "rejected", error: error.message };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // Two uploads of the same sale at once: the other one recorded it.
      const recorded = await prisma.posSale.findUnique({ where: { clientId: input.clientId }, select: summarySelect });
      if (recorded) return asResult(input.clientId, "duplicate", recorded);
      return { clientId: input.clientId, status: "rejected", error: `Receipt ${input.receiptNumber} was already used by another sale.` };
    }
    throw error;
  }
}

/** Records a batch from one upload, oldest first, and refreshes the storefront once. */
export async function recordPosSales(inputs: readonly PosSaleUpload[], now: Date = new Date()): Promise<PosSaleResult[]> {
  const ordered = inputs.toSorted((a, b) => Date.parse(a.soldAt) - Date.parse(b.soldAt));
  const results: PosSaleResult[] = [];
  for (const input of ordered) results.push(await recordPosSale(input, now));
  // Stock shown in the shop changed.
  if (results.some((r) => r.status === "recorded")) invalidateStorefront();
  return results;
}

async function createSale(tx: Tx, input: PosSaleUpload, now: Date): Promise<SaleSummary> {
  const soldAt = new Date(input.soldAt);
  if (soldAt.getTime() > now.getTime() + CLOCK_SKEW_MS) throw new PosSaleRejected("The till's clock is ahead of the server. Check the date and time on the till.");
  if (soldAt.getTime() < now.getTime() - MAX_OFFLINE_MS) throw new PosSaleRejected("This sale is more than 90 days old.");

  const receipt = parseReceiptNumber(input.receiptNumber);
  if (!receipt || receipt.tillCode !== input.tillCode) throw new PosSaleRejected("The receipt number does not belong to this till.");

  const till = await tx.posTill.findUnique({ where: { code: input.tillCode }, select: { id: true, isActive: true } });
  if (!till?.isActive) throw new PosSaleRejected(`Till ${input.tillCode} is not set up or has been switched off.`);

  const cashier = await tx.user.findUnique({ where: { id: input.cashierId }, select: { role: true } });
  if (!cashier || !hasPermission(cashier.role, "pos:sell")) throw new PosSaleRejected("The cashier on this sale is not allowed to use the till.");

  const shift = input.shiftClientId
    ? await tx.posShift.findFirst({ where: { clientId: input.shiftClientId, tillId: till.id }, select: { id: true } })
    : null;

  const variantIds = input.items.map((item) => item.variantId);
  if (new Set(variantIds).size !== variantIds.length) throw new PosSaleRejected("The same item appears twice in this sale.");
  const variants = await tx.productVariant.findMany({
    where: { id: { in: variantIds } },
    include: { product: { select: { name: true } }, priceTiers: { select: { minQtyMilli: true, unitPriceMinor: true } } },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));
  if (byId.size !== variantIds.length) throw new PosSaleRejected("An item in this sale is no longer in the catalogue.");

  // Lock stock rows in a fixed order so concurrent checkouts cannot deadlock.
  const lines = input.items
    .map((item) => {
      const variant = byId.get(item.variantId)!;
      return {
        item,
        variant,
        listUnitPriceMinor: unitPriceForQuantity(variant, variant.priceTiers, item.quantityMilli, soldAt),
        lineTotalMinor: lineTotalMinor(item.unitPriceMinor, item.quantityMilli),
      };
    })
    .toSorted((a, b) => a.variant.id.localeCompare(b.variant.id));

  const totalMinor = lines.reduce((sum, line) => sum + line.lineTotalMinor, 0);
  const settlement = settleTender(totalMinor, input.payments);
  if (!settlement.ok) throw new PosSaleRejected(settlement.error);

  const stock: { before: number; after: number }[] = [];
  for (const line of lines) {
    const [row] = await tx.$queryRaw<{ before: number; after: number }[]>`
      WITH current AS (SELECT id, "stockMilli" FROM "ProductVariant" WHERE id = ${line.variant.id} FOR UPDATE)
      UPDATE "ProductVariant" v
      SET "stockMilli" = GREATEST(current."stockMilli" - ${line.item.quantityMilli}, 0), "updatedAt" = now()
      FROM current WHERE v.id = current.id
      RETURNING current."stockMilli" AS before, v."stockMilli" AS after
    `;
    stock.push(row!);
  }

  const shortfalls = lines.map((line, i) => line.item.quantityMilli - (stock[i]!.before - stock[i]!.after));
  const sale = await tx.posSale.create({
    data: {
      clientId: input.clientId,
      receiptNumber: input.receiptNumber,
      tillId: till.id,
      shiftId: shift?.id ?? null,
      cashierId: input.cashierId,
      totalMinor,
      paidMinor: settlement.paidMinor,
      changeMinor: settlement.changeMinor,
      hasShortfall: shortfalls.some((s) => s > 0),
      hasPriceDifference: lines.some((line) => line.item.unitPriceMinor !== line.listUnitPriceMinor),
      soldAt,
      items: {
        create: lines.map((line, i) => ({
          variantId: line.variant.id,
          productName: line.variant.product.name,
          variantName: line.variant.name,
          sku: line.variant.sku,
          unit: line.variant.unit,
          quantityMilli: line.item.quantityMilli,
          unitPriceMinor: line.item.unitPriceMinor,
          listUnitPriceMinor: line.listUnitPriceMinor,
          lineTotalMinor: line.lineTotalMinor,
          shortfallMilli: shortfalls[i]!,
        })),
      },
      payments: {
        create: input.payments.map((p) => ({ method: p.method, amountMinor: p.amountMinor, reference: p.reference?.trim() || null })),
      },
    },
    select: summarySelect,
  });

  for (const [i, line] of lines.entries()) {
    const { before, after } = stock[i]!;
    if (before === after) continue; // nothing was in stock to take
    const short = shortfalls[i]!;
    await tx.inventoryMovement.create({
      data: {
        variantId: line.variant.id,
        type: "POS_SALE",
        deltaMilli: after - before,
        balanceAfterMilli: after,
        posSaleId: sale.id,
        actorId: input.cashierId,
        reason:
          short > 0
            ? `Sold at the till (${input.receiptNumber}); ${formatQuantity(short, line.variant.unit as SellingUnitCode)} more than recorded stock`
            : `Sold at the till (${input.receiptNumber})`,
      },
    });
  }

  await tx.$executeRaw`
    UPDATE "PosTill" SET "lastReceiptSeq" = GREATEST("lastReceiptSeq", ${receipt.sequence}), "updatedAt" = now() WHERE id = ${till.id}
  `;
  return sale;
}
