import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma, type Tx } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { refundForLine, refundMethodProblem, returnQuantityProblem, type PosReturnInput, type PosReturnResult } from "@/lib/pos-returns";
import { formatQuantity, type SellingUnitCode } from "@/lib/quantity";
import { recordAudit } from "@/server/audit";
import { invalidateStorefront } from "@/server/storefront-cache";
import { approvingManager, type Approver } from "./approval";
import { activeTill, PosRejected, type TillUser } from "./common";
import { refundRecord, saleRecord } from "./history";

/**
 * Takes goods back from an earlier sale and records the money given back for
 * them, paid out of the shift open on the till. Goods fit to sell again go
 * back into stock; damaged or expired ones do not. A manager approves.
 * Sending the same return again returns the one recorded the first time.
 */
export async function recordPosReturn(input: PosReturnInput, user: TillUser): Promise<PosReturnResult> {
  const existing = await recordedReturn(input.clientId, user);
  if (existing) return existing;

  try {
    const methodProblem = refundMethodProblem(input.method, input.reference);
    if (methodProblem) throw new PosRejected(methodProblem);
    const approver = await approvingManager(user, input.approval);
    const { id, restocked } = await prisma.$transaction((tx) => createReturn(tx, input, user, approver));
    if (restocked) invalidateStorefront();
    const [refund, sale] = await Promise.all([refundRecord({ id }), saleRecord({ id: input.saleId })]);
    if (!refund || !sale) throw new Error("A return just recorded could not be read back");
    return { status: "recorded", refund, sale };
  } catch (error) {
    if (error instanceof PosRejected) return { status: "rejected", error: error.message };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // The same return sent twice at once: the other request recorded it.
      const recorded = await recordedReturn(input.clientId, user);
      if (recorded) return recorded;
    }
    throw error;
  }
}

async function recordedReturn(clientId: string, user: TillUser): Promise<PosReturnResult | null> {
  const existing = await prisma.posReturn.findUnique({ where: { clientId }, select: { id: true, saleId: true, cashierId: true } });
  if (!existing) return null;
  if (existing.cashierId !== user.id && !hasPermission(user.role, "pos:manage")) return { status: "rejected", error: "This return was made by another cashier." };
  const [refund, sale] = await Promise.all([refundRecord({ id: existing.id }), saleRecord({ id: existing.saleId })]);
  return refund && sale ? { status: "duplicate", refund, sale } : null;
}

async function createReturn(tx: Tx, input: PosReturnInput, user: TillUser, approver: Approver): Promise<{ id: string; restocked: boolean }> {
  const till = await activeTill(tx, input.tillCode);
  // Locked, so the refund cannot land in a shift that is being closed at the same moment.
  const [shift] = await tx.$queryRaw<{ id: string; tillId: string; cashierId: string; closedAt: Date | null }[]>`
    SELECT id, "tillId", "cashierId", "closedAt" FROM "PosShift" WHERE "clientId" = ${input.shiftClientId} FOR UPDATE
  `;
  if (!shift || shift.tillId !== till.id || shift.closedAt) throw new PosRejected("A refund is paid out of the shift open on this till. Open a shift first.");
  if (shift.cashierId !== user.id) throw new PosRejected("The shift open on this till belongs to another cashier.");

  // Locked so two returns (or a return and a void) of one sale cannot both take the same goods back.
  const [locked] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "PosSale" WHERE id = ${input.saleId} FOR UPDATE`;
  if (!locked) throw new PosRejected("The sale for this return was not found.");
  const sale = await tx.posSale.findUniqueOrThrow({
    where: { id: input.saleId },
    select: {
      id: true,
      receiptNumber: true,
      status: true,
      items: {
        select: { id: true, variantId: true, productName: true, unit: true, quantityMilli: true, returnedMilli: true, unitPriceMinor: true, lineTotalMinor: true, refundedMinor: true },
      },
    },
  });
  if (sale.status === "VOIDED") throw new PosRejected("This sale was voided, so there is nothing to return.");

  const ids = input.items.map((item) => item.saleItemId);
  if (new Set(ids).size !== ids.length) throw new PosRejected("The same item appears twice in this return.");
  const byId = new Map(sale.items.map((item) => [item.id, item]));
  const lines = input.items.map((request) => {
    const line = byId.get(request.saleItemId);
    if (!line) throw new PosRejected("An item in this return is not part of the sale.");
    const unit = line.unit as SellingUnitCode;
    const problem = returnQuantityProblem({ ...line, unit }, request.quantityMilli);
    if (problem) throw new PosRejected(problem);
    return { request, line, unit, refundMinor: refundForLine(line, request.quantityMilli) };
  });

  const created = await tx.posReturn.create({
    data: {
      clientId: input.clientId,
      saleId: sale.id,
      tillId: till.id,
      shiftId: shift.id,
      cashierId: user.id,
      approvedById: approver.id,
      reason: input.reason,
      method: input.method,
      reference: input.reference?.trim() || null,
      refundMinor: lines.reduce((sum, line) => sum + line.refundMinor, 0),
      items: {
        create: lines.map(({ request, refundMinor }) => ({
          saleItemId: request.saleItemId,
          quantityMilli: request.quantityMilli,
          refundMinor,
          restocked: request.restock,
        })),
      },
    },
    select: { id: true, number: true, refundMinor: true },
  });

  for (const { request, line, refundMinor } of lines) {
    await tx.posSaleItem.update({ where: { id: line.id }, data: { returnedMilli: { increment: request.quantityMilli }, refundedMinor: { increment: refundMinor } } });
  }

  // Back on the shelf, in a fixed order so concurrent stock changes cannot deadlock.
  const restock = lines.filter((line) => line.request.restock && line.line.variantId).toSorted((a, b) => a.line.variantId!.localeCompare(b.line.variantId!));
  for (const { request, line, unit } of restock) {
    const [row] = await tx.$queryRaw<{ after: number }[]>`
      UPDATE "ProductVariant" SET "stockMilli" = "stockMilli" + ${request.quantityMilli}, "updatedAt" = now()
      WHERE id = ${line.variantId} RETURNING "stockMilli" AS after
    `;
    if (!row) continue;
    await tx.inventoryMovement.create({
      data: {
        variantId: line.variantId!,
        type: "POS_RETURN",
        deltaMilli: request.quantityMilli,
        balanceAfterMilli: row.after,
        posReturnId: created.id,
        actorId: user.id,
        reason: `Returned at the till from ${sale.receiptNumber} (${formatQuantity(request.quantityMilli, unit)})`,
      },
    });
  }

  await recordAudit(
    {
      actorId: approver.id,
      action: "pos.sale.return",
      entityType: "PosSale",
      entityId: sale.id,
      details: {
        receiptNumber: sale.receiptNumber,
        returnNumber: created.number,
        refundMinor: created.refundMinor,
        method: input.method,
        reason: input.reason,
        restocked: restock.length,
        atTillBy: user.id,
      },
    },
    tx,
  );
  return { id: created.id, restocked: restock.length > 0 };
}
