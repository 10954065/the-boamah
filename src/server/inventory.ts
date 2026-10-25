import "server-only";
import type { InventoryMovementType } from "@/generated/prisma/client";
import type { Tx } from "@/lib/db";

export class InsufficientStockError extends Error {
  constructor(readonly variantId: string) {
    super("Insufficient stock");
    this.name = "InsufficientStockError";
  }
}

/**
 * Atomically deducts stock for an order line. The conditional UPDATE takes a
 * row lock and only succeeds when enough stock remains, so concurrent
 * checkouts cannot oversell. Throws InsufficientStockError otherwise.
 */
export async function reserveStock(tx: Tx, input: { variantId: string; quantityMilli: number; orderId: string }): Promise<void> {
  const rows = await tx.$queryRaw<{ stockMilli: number }[]>`
    UPDATE "ProductVariant"
    SET "stockMilli" = "stockMilli" - ${input.quantityMilli}, "updatedAt" = now()
    WHERE id = ${input.variantId} AND "isActive" AND "stockMilli" >= ${input.quantityMilli}
    RETURNING "stockMilli"
  `;
  const balance = rows[0]?.stockMilli;
  if (balance === undefined) throw new InsufficientStockError(input.variantId);
  await tx.inventoryMovement.create({
    data: {
      variantId: input.variantId,
      type: "ORDER_RESERVED",
      deltaMilli: -input.quantityMilli,
      balanceAfterMilli: balance,
      orderId: input.orderId,
      reason: "Reserved for order",
    },
  });
}

/**
 * Returns stock reserved by an order. Idempotent: the unique
 * (orderId, variantId, type) constraint on movements means a second release
 * for the same line is skipped, so retries never restore stock twice.
 */
export async function releaseOrderStock(tx: Tx, orderId: string, actorId: string | null, reason: string): Promise<number> {
  const reservations = await tx.inventoryMovement.findMany({
    where: { orderId, type: "ORDER_RESERVED" },
    select: { variantId: true, deltaMilli: true },
  });
  let released = 0;
  for (const reservation of reservations) {
    const alreadyReleased = await tx.inventoryMovement.findUnique({
      where: { orderId_variantId_type: { orderId, variantId: reservation.variantId, type: "ORDER_RELEASED" } },
      select: { id: true },
    });
    if (alreadyReleased) continue;
    const quantity = -reservation.deltaMilli;
    const variant = await tx.productVariant.update({
      where: { id: reservation.variantId },
      data: { stockMilli: { increment: quantity } },
      select: { stockMilli: true },
    });
    await tx.inventoryMovement.create({
      data: {
        variantId: reservation.variantId,
        type: "ORDER_RELEASED",
        deltaMilli: quantity,
        balanceAfterMilli: variant.stockMilli,
        orderId,
        actorId,
        reason,
      },
    });
    released += 1;
  }
  return released;
}

export type ManualMovementType = Extract<InventoryMovementType, "RECEIPT" | "ADJUSTMENT" | "CORRECTION">;

/**
 * Staff stock change. RECEIPT adds stock; ADJUSTMENT/CORRECTION may add or
 * remove. Never allows the balance to go negative.
 */
export async function adjustStock(
  tx: Tx,
  input: { variantId: string; deltaMilli: number; type: ManualMovementType; reason: string; actorId: string },
): Promise<number> {
  if (!Number.isSafeInteger(input.deltaMilli) || input.deltaMilli === 0) throw new Error("Invalid stock change.");
  if (input.type === "RECEIPT" && input.deltaMilli < 0) throw new Error("A stock receipt must add stock.");
  const rows = await tx.$queryRaw<{ stockMilli: number }[]>`
    UPDATE "ProductVariant"
    SET "stockMilli" = "stockMilli" + ${input.deltaMilli}, "updatedAt" = now()
    WHERE id = ${input.variantId} AND "stockMilli" + ${input.deltaMilli} >= 0
    RETURNING "stockMilli"
  `;
  const balance = rows[0]?.stockMilli;
  if (balance === undefined) throw new InsufficientStockError(input.variantId);
  await tx.inventoryMovement.create({
    data: {
      variantId: input.variantId,
      type: input.type,
      deltaMilli: input.deltaMilli,
      balanceAfterMilli: balance,
      reason: input.reason,
      actorId: input.actorId,
    },
  });
  return balance;
}
