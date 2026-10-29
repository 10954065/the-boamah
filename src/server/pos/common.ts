import "server-only";
import type { Tx } from "@/lib/db";

/** Why a sale was refused, when the till can act on it (for example by renumbering the receipt). */
export type PosRejectReason = "shift-closed" | "receipt-used" | "other-cashier";

/** Something the till sent that the server will not record; the till shows the reason. */
export class PosRejected extends Error {
  constructor(
    message: string,
    readonly reason?: PosRejectReason,
  ) {
    super(message);
  }
}

/** The till's clock may run a little fast. */
const CLOCK_SKEW_MS = 10 * 60_000;
/** A till that has been offline longer than this needs a manager to look at what it sends. */
const MAX_OFFLINE_MS = 90 * 86_400_000;

/** Times come from the till's clock, so they are checked against the server's. */
export function checkTillClock(at: Date, now: Date, what: "sale" | "shift"): void {
  if (at.getTime() > now.getTime() + CLOCK_SKEW_MS) throw new PosRejected("The till's clock is ahead of the server. Check the date and time on the till.");
  if (at.getTime() < now.getTime() - MAX_OFFLINE_MS) throw new PosRejected(`This ${what} is more than 90 days old.`);
}

export async function activeTill(tx: Tx, code: string): Promise<{ id: string; lastReceiptSeq: number }> {
  const till = await tx.posTill.findUnique({ where: { code }, select: { id: true, isActive: true, lastReceiptSeq: true } });
  if (!till?.isActive) throw new PosRejected(`Till ${code} is not set up or has been switched off.`);
  return { id: till.id, lastReceiptSeq: till.lastReceiptSeq };
}
