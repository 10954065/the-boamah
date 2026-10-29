import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma, type Tx } from "@/lib/db";
import { hasPermission, type RoleCode } from "@/lib/permissions";
import { parseReceiptNumber, settleTender, type PosSaleUpload } from "@/lib/pos";
import { unitPriceForQuantity } from "@/lib/pricing";
import { formatQuantity, lineTotalMinor, type SellingUnitCode } from "@/lib/quantity";
import { invalidateStorefront } from "@/server/storefront-cache";
import { activeTill, checkTillClock, PosRejected, type PosRejectReason } from "./common";

/**
 * Receipts are numbered on the till, so the server only accepts a number a
 * little ahead of the last one it has seen. A batch from a till that was
 * offline is recorded oldest first, so each sale stays within reach.
 */
const MAX_RECEIPT_JUMP = 1000;

export type PosSaleResult =
  | { clientId: string; status: "recorded" | "duplicate"; saleId: string; receiptNumber: string; shortfall: boolean; priceDifference: boolean }
  | { clientId: string; status: "rejected"; error: string; reason?: PosRejectReason; lastReceiptSeq?: number };

/** Who is sending the sales. */
export interface PosUploader {
  id: string;
  role: RoleCode;
}

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
    if (error instanceof PosRejected) return { clientId: input.clientId, status: "rejected", error: error.message, reason: error.reason };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // Two uploads of the same sale at once: the other one recorded it.
      const recorded = await prisma.posSale.findUnique({ where: { clientId: input.clientId }, select: summarySelect });
      if (recorded) return asResult(input.clientId, "duplicate", recorded);
      // Another sale has this number: tell the till where numbering has got to so it can renumber.
      const till = await prisma.posTill.findUnique({ where: { code: input.tillCode }, select: { lastReceiptSeq: true } });
      return {
        clientId: input.clientId,
        status: "rejected",
        error: `Receipt ${input.receiptNumber} was already used by another sale.`,
        reason: "receipt-used",
        lastReceiptSeq: till?.lastReceiptSeq,
      };
    }
    throw error;
  }
}

/**
 * Records a batch from one upload, oldest first, and refreshes the storefront
 * once. A cashier sends only their own sales; a manager may send anyone's.
 */
export async function recordPosSales(inputs: readonly PosSaleUpload[], uploader: PosUploader, now: Date = new Date()): Promise<PosSaleResult[]> {
  const ordered = inputs.toSorted((a, b) => Date.parse(a.soldAt) - Date.parse(b.soldAt));
  const mayUploadAny = hasPermission(uploader.role, "pos:manage");
  const results: PosSaleResult[] = [];
  for (const input of ordered) {
    if (input.cashierId !== uploader.id && !mayUploadAny) {
      results.push({
        clientId: input.clientId,
        status: "rejected",
        error: "This sale was made by another cashier. They need to sign in on the till to send it.",
        reason: "other-cashier",
      });
    } else {
      results.push(await recordPosSale(input, now));
    }
  }
  // Stock shown in the shop changed.
  if (results.some((r) => r.status === "recorded")) invalidateStorefront();
  return results;
}

/** The shift a sale belongs to: on this till, the same cashier's, and open when the sale was made. */
async function saleShift(tx: Tx, input: PosSaleUpload, tillId: string, soldAt: Date): Promise<{ id: string } | null> {
  if (!input.shiftClientId) return null;
  const shift = await tx.posShift.findUnique({
    where: { clientId: input.shiftClientId },
    select: { id: true, tillId: true, cashierId: true, closedAt: true },
  });
  if (!shift || shift.tillId !== tillId) throw new PosRejected("The shift for this sale was not found on this till.");
  if (shift.cashierId !== input.cashierId) throw new PosRejected("This sale belongs to another cashier's shift.");
  if (shift.closedAt && soldAt > shift.closedAt) {
    throw new PosRejected("This shift was closed before the sale was made. Open a new shift and take the payment again.", "shift-closed");
  }
  return { id: shift.id };
}

async function createSale(tx: Tx, input: PosSaleUpload, now: Date): Promise<SaleSummary> {
  const soldAt = new Date(input.soldAt);
  checkTillClock(soldAt, now, "sale");

  const receipt = parseReceiptNumber(input.receiptNumber);
  if (!receipt || receipt.tillCode !== input.tillCode) throw new PosRejected("The receipt number does not belong to this till.");

  const till = await activeTill(tx, input.tillCode);
  if (receipt.sequence > till.lastReceiptSeq + MAX_RECEIPT_JUMP) throw new PosRejected("The receipt number is far ahead of this till's last receipt.");

  const cashier = await tx.user.findUnique({ where: { id: input.cashierId }, select: { role: true, status: true } });
  if (!cashier || cashier.status !== "ACTIVE" || !hasPermission(cashier.role, "pos:sell")) {
    throw new PosRejected("The cashier on this sale is not allowed to use the till.");
  }

  const shift = await saleShift(tx, input, till.id, soldAt);

  const variantIds = input.items.map((item) => item.variantId);
  if (new Set(variantIds).size !== variantIds.length) throw new PosRejected("The same item appears twice in this sale.");
  const variants = await tx.productVariant.findMany({
    where: { id: { in: variantIds } },
    include: { product: { select: { name: true } }, priceTiers: { select: { minQtyMilli: true, unitPriceMinor: true } } },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));
  if (byId.size !== variantIds.length) throw new PosRejected("An item in this sale is no longer in the catalogue.");

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
  if (!settlement.ok) throw new PosRejected(settlement.error);

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
