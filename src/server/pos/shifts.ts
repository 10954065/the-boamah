import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { hasPermission, type RoleCode } from "@/lib/permissions";
import {
  summariseShiftSales,
  type PosShiftClose,
  type PosShiftOpen,
  type PosShiftView,
  type ShiftCloseResult,
  type ShiftOpenResult,
  type ShiftSummary,
} from "@/lib/pos";
import { activeTill, checkTillClock, PosRejected } from "./common";

interface TillUser {
  id: string;
  role: RoleCode;
}

const shiftSelect = {
  id: true,
  clientId: true,
  cashierId: true,
  openedAt: true,
  openingFloatMinor: true,
  closedAt: true,
  countedCashMinor: true,
  countedMomoMinor: true,
  countedCardMinor: true,
  notes: true,
  till: { select: { code: true } },
  cashier: { select: { name: true } },
} satisfies Prisma.PosShiftSelect;

type ShiftRow = Prisma.PosShiftGetPayload<{ select: typeof shiftSelect }>;

function toView(shift: ShiftRow): PosShiftView {
  const counted = shift.closedAt
    ? { CASH: shift.countedCashMinor ?? 0, MOMO: shift.countedMomoMinor ?? 0, CARD: shift.countedCardMinor ?? 0 }
    : null;
  return {
    clientId: shift.clientId,
    tillCode: shift.till.code,
    cashierId: shift.cashierId,
    cashierName: shift.cashier.name,
    openedAt: shift.openedAt.toISOString(),
    openingFloatMinor: shift.openingFloatMinor,
    closedAt: shift.closedAt?.toISOString() ?? null,
    countedMinor: counted,
    notes: shift.notes,
  };
}

/** Another shift is open on the till; only one runs at a time. */
class ShiftAlreadyOpen extends PosRejected {
  constructor(readonly shift: ShiftRow) {
    super(`${shift.cashier.name}'s shift is still open on this till. It has to be closed first.`);
  }
}

/** The open shift on a till, if any. */
export async function openShiftForTill(tillCode: string): Promise<PosShiftView | null> {
  const shift = await prisma.posShift.findFirst({ where: { till: { code: tillCode }, closedAt: null }, orderBy: { openedAt: "desc" }, select: shiftSelect });
  return shift ? toView(shift) : null;
}

/**
 * Opens a shift with the cash float in the drawer. Sending the same shift
 * again returns it unchanged. The till row is locked so two shifts cannot
 * open on one till at the same moment.
 */
export async function openPosShift(input: PosShiftOpen, cashier: TillUser, now: Date = new Date()): Promise<ShiftOpenResult> {
  const existing = await prisma.posShift.findUnique({ where: { clientId: input.clientId }, select: shiftSelect });
  if (existing) {
    if (existing.cashierId !== cashier.id) return { status: "rejected", error: "This shift belongs to another cashier.", openShift: null };
    return { status: "duplicate", shift: toView(existing) };
  }
  if (!hasPermission(cashier.role, "pos:sell")) return { status: "rejected", error: "This account cannot use the till.", openShift: null };

  try {
    const shift = await prisma.$transaction(async (tx) => {
      const openedAt = new Date(input.openedAt);
      checkTillClock(openedAt, now, "shift");
      const till = await activeTill(tx, input.tillCode);
      await tx.$queryRaw`SELECT id FROM "PosTill" WHERE id = ${till.id} FOR UPDATE`;
      const open = await tx.posShift.findFirst({ where: { tillId: till.id, closedAt: null }, select: shiftSelect });
      if (open) throw new ShiftAlreadyOpen(open);
      return tx.posShift.create({
        data: { clientId: input.clientId, tillId: till.id, cashierId: cashier.id, openedAt, openingFloatMinor: input.openingFloatMinor },
        select: shiftSelect,
      });
    });
    return { status: "opened", shift: toView(shift) };
  } catch (error) {
    if (error instanceof ShiftAlreadyOpen) return { status: "rejected", error: error.message, openShift: toView(error.shift) };
    if (error instanceof PosRejected) return { status: "rejected", error: error.message, openShift: null };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // The same shift sent twice at once: the other request opened it.
      const opened = await prisma.posShift.findUnique({ where: { clientId: input.clientId }, select: shiftSelect });
      if (opened?.cashierId === cashier.id) return { status: "duplicate", shift: toView(opened) };
    }
    throw error;
  }
}

/**
 * Closes a shift with what was counted. The cashier who opened it can close
 * it, and so can a manager (for a shift left open). Closing again returns the
 * first close unchanged.
 */
export async function closePosShift(input: PosShiftClose, user: TillUser, now: Date = new Date()): Promise<ShiftCloseResult> {
  const shift = await prisma.posShift.findUnique({ where: { clientId: input.clientId }, select: shiftSelect });
  if (!shift) return { status: "rejected", error: "This shift was not found." };
  if (shift.cashierId !== user.id && !hasPermission(user.role, "pos:manage")) {
    return { status: "rejected", error: "Only the cashier who opened this shift, or a manager, can close it." };
  }
  if (shift.closedAt) return { status: "duplicate", shift: toView(shift), summary: await shiftSummary(shift) };

  const closedAt = new Date(input.closedAt);
  try {
    checkTillClock(closedAt, now, "shift");
  } catch (error) {
    if (error instanceof PosRejected) return { status: "rejected", error: error.message };
    throw error;
  }
  if (closedAt < shift.openedAt) return { status: "rejected", error: "The till's clock is behind the time this shift opened. Check the date and time on the till." };

  const { count } = await prisma.posShift.updateMany({
    where: { id: shift.id, closedAt: null },
    data: {
      closedAt,
      countedCashMinor: input.countedCashMinor,
      countedMomoMinor: input.countedMomoMinor,
      countedCardMinor: input.countedCardMinor,
      notes: input.notes?.trim() || null,
    },
  });
  const closed = await prisma.posShift.findUniqueOrThrow({ where: { id: shift.id }, select: shiftSelect });
  return { status: count === 1 ? "closed" : "duplicate", shift: toView(closed), summary: await shiftSummary(closed) };
}

/** What the shift's recorded sales took, less the refunds paid out of it, and what should be at the till. */
export async function shiftSummary(shift: Pick<ShiftRow, "id" | "openingFloatMinor">): Promise<ShiftSummary> {
  const [sales, refunds] = await Promise.all([
    prisma.posSale.findMany({
      where: { shiftId: shift.id },
      select: { status: true, totalMinor: true, changeMinor: true, payments: { select: { method: true, amountMinor: true } } },
    }),
    prisma.posReturn.findMany({ where: { shiftId: shift.id }, select: { method: true, refundMinor: true } }),
  ]);
  return summariseShiftSales(shift.openingFloatMinor, sales, refunds);
}
