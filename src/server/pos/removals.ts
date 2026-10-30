import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { POS_MAX_ITEMS } from "@/lib/pos";
import type { OutboxEntry } from "@/lib/pos-outbox";
import { lineTotalMinor } from "@/lib/quantity";
import type { PosRemovalInput, PosRemovalResult } from "@/lib/pos-returns";
import { recordAudit } from "@/server/audit";
import { approvingManager } from "./approval";
import { PosRejected, type TillUser } from "./common";

/** Kept in the record of a removed sale; as many lines as a sale can have. */
const MAX_RECORDED_LINES = POS_MAX_ITEMS;
const MAX_TEXT = 200;

/** Text from the till, kept to a sensible length. */
const clip = (value: string | null | undefined, max = MAX_TEXT): string | null => (typeof value === "string" ? value.slice(0, max) : null);

/**
 * What the shop keeps about an entry removed from a till: enough to account
 * for money that was taken. It is the till's own account of the entry, so the
 * total is worked out from the items and prices the till would have sent.
 */
function entryDetails(entry: OutboxEntry): Prisma.InputJsonObject {
  const base = { kind: entry.kind, entryId: clip(entry.id), cashierId: clip(entry.cashierId), cashierName: clip(entry.cashierName), createdAt: clip(entry.createdAt), error: clip(entry.error, 500) };
  if (entry.kind === "sale") {
    return {
      ...base,
      receiptNumber: entry.upload.receiptNumber,
      printedNumber: clip(entry.printedNumber),
      soldAt: entry.upload.soldAt,
      shiftClientId: entry.upload.shiftClientId ?? null,
      totalMinor: entry.upload.items.reduce((sum, item) => sum + lineTotalMinor(item.unitPriceMinor, item.quantityMilli), 0),
      payments: entry.upload.payments.map((p) => ({ method: p.method, amountMinor: p.amountMinor, reference: p.reference ?? null })),
      lines: entry.receipt.lines.slice(0, MAX_RECORDED_LINES).map((line) => ({
        name: clip(line.name),
        detail: clip(line.detail),
        quantityMilli: line.quantityMilli,
        lineTotalMinor: line.lineTotalMinor,
      })),
    };
  }
  if (entry.kind === "shift-open") return { ...base, shiftClientId: entry.shift.clientId, openedAt: entry.shift.openedAt, openingFloatMinor: entry.shift.openingFloatMinor };
  return {
    ...base,
    shiftClientId: entry.input.clientId,
    closedAt: entry.input.closedAt,
    counted: { CASH: entry.input.countedCashMinor, MOMO: entry.input.countedMomoMinor, CARD: entry.input.countedCardMinor },
  };
}

/**
 * Records that something the shop's system refused was removed from a till
 * for good, with a manager's approval. The till removes it only once this is
 * recorded, so the shop always knows about a paid sale that never arrived.
 */
export async function recordRemoval(input: PosRemovalInput, user: TillUser): Promise<PosRemovalResult> {
  const entry = input.entry as OutboxEntry;
  try {
    if (entry.status !== "refused") throw new PosRejected("Only items the shop's system did not accept can be removed.");
    if (entry.cashierId !== user.id && !hasPermission(user.role, "pos:manage")) throw new PosRejected("This was made by another cashier.");
    const tillCode = entry.kind === "sale" ? entry.upload.tillCode : entry.kind === "shift-open" ? entry.input.tillCode : input.tillCode;
    const madeBy = entry.kind === "sale" ? entry.upload.cashierId : entry.cashierId;
    if (tillCode !== input.tillCode || madeBy !== entry.cashierId) throw new PosRejected("This does not belong to this till.");
    const approver = await approvingManager(user, input.approval);
    // A sale that reached the shop after all loses nothing by being removed from the till.
    const recorded = entry.kind === "sale" ? (await prisma.posSale.count({ where: { clientId: entry.upload.clientId } })) > 0 : false;
    await recordAudit({
      actorId: approver.id,
      action: "pos.entry.removed",
      entityType: "PosTill",
      entityId: input.tillCode,
      details: { ...entryDetails(entry), tillCode: input.tillCode, reason: input.reason, recordedAnyway: recorded, atTillBy: user.id, reportedByTill: true },
    });
    return { status: "recorded" };
  } catch (error) {
    if (error instanceof PosRejected) return { status: "rejected", error: error.message };
    throw error;
  }
}
