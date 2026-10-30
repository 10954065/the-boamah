import "server-only";
import { prisma, type Tx } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { voidProblem, type PosVoidInput, type PosVoidResult } from "@/lib/pos-returns";
import { recordAudit } from "@/server/audit";
import { invalidateStorefront } from "@/server/storefront-cache";
import { approvingManager, type Approver } from "./approval";
import { PosRejected, type TillUser } from "./common";
import { saleRecord } from "./history";

/**
 * Voids a sale of the shift open on the till: the money goes back to the
 * customer the way it came, so the sale counts nowhere, and every item goes
 * back into stock. A manager approves. Voiding again returns the sale as voided.
 */
export async function voidPosSale(input: PosVoidInput, user: TillUser, now: Date = new Date()): Promise<PosVoidResult> {
  try {
    const approver = await approvingManager(user, input.approval);
    const outcome = await prisma.$transaction((tx) => voidSale(tx, input, user, approver, now));
    if (outcome === "voided") invalidateStorefront(); // stock went back on the shelf
    const sale = await saleRecord({ id: input.saleId });
    if (!sale) throw new PosRejected("This sale was not found.");
    return { status: outcome === "already-voided" ? "duplicate" : "voided", sale };
  } catch (error) {
    if (error instanceof PosRejected) return { status: "rejected", error: error.message };
    throw error;
  }
}

async function voidSale(tx: Tx, input: PosVoidInput, user: TillUser, approver: Approver, now: Date): Promise<"voided" | "already-voided"> {
  const target = await tx.posSale.findUnique({ where: { id: input.saleId }, select: { shiftId: true } });
  if (!target) throw new PosRejected("This sale was not found.");
  // The shift, then the sale, as returns do: a void cannot slip in while the shift is
  // being closed, and a void and a return of the same sale cannot both go through.
  if (target.shiftId) await tx.$queryRaw`SELECT id FROM "PosShift" WHERE id = ${target.shiftId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM "PosSale" WHERE id = ${input.saleId} FOR UPDATE`;
  const sale = await tx.posSale.findUniqueOrThrow({
    where: { id: input.saleId },
    select: {
      id: true,
      receiptNumber: true,
      status: true,
      totalMinor: true,
      shift: { select: { clientId: true, closedAt: true, cashierId: true } },
      items: { select: { variantId: true, quantityMilli: true } },
      _count: { select: { returns: true } },
    },
  });
  if (sale.shift && sale.shift.cashierId !== user.id && !hasPermission(user.role, "pos:manage")) throw new PosRejected("This sale belongs to another cashier's shift.");
  if (sale.status === "VOIDED") return "already-voided";
  const problem = voidProblem(
    { status: sale.status, returned: sale._count.returns > 0, shiftOpen: sale.shift !== null && sale.shift.closedAt === null, shiftClientId: sale.shift?.clientId ?? null },
    input.shiftClientId,
  );
  if (problem) throw new PosRejected(problem);

  // Everything sold goes back, in a fixed order so concurrent stock changes cannot deadlock.
  const restock = sale.items.flatMap((item) => (item.variantId ? [{ variantId: item.variantId, quantityMilli: item.quantityMilli }] : [])).toSorted((a, b) => a.variantId.localeCompare(b.variantId));
  for (const item of restock) {
    const [row] = await tx.$queryRaw<{ after: number }[]>`
      UPDATE "ProductVariant" SET "stockMilli" = "stockMilli" + ${item.quantityMilli}, "updatedAt" = now()
      WHERE id = ${item.variantId} RETURNING "stockMilli" AS after
    `;
    if (!row) continue;
    await tx.inventoryMovement.create({
      data: {
        variantId: item.variantId,
        type: "POS_VOID",
        deltaMilli: item.quantityMilli,
        balanceAfterMilli: row.after,
        posSaleId: sale.id,
        actorId: user.id,
        reason: `Till sale ${sale.receiptNumber} voided`,
      },
    });
  }

  await tx.posSale.update({ where: { id: sale.id }, data: { status: "VOIDED", voidedAt: now, voidedById: approver.id, voidReason: input.reason } });
  await recordAudit(
    {
      actorId: approver.id,
      action: "pos.sale.void",
      entityType: "PosSale",
      entityId: sale.id,
      details: { receiptNumber: sale.receiptNumber, totalMinor: sale.totalMinor, reason: input.reason, atTillBy: user.id },
    },
    tx,
  );
  return "voided";
}
