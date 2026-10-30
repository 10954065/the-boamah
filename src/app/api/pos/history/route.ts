import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { parseReceiptNumber } from "@/lib/pos";
import { PosRejected } from "@/server/pos/common";
import { saleRecord, shiftHistory } from "@/server/pos/history";
import { tillError, tillJson, tillRequestUser } from "@/server/pos/request";

const shiftIdSchema = z.uuid();

/**
 * Recorded till sales: `?shift=<id>` lists a shift's sales and refunds, and
 * `?receipt=T1-000231` finds one sale (for a copy of its receipt, a void or a return).
 */
export async function GET(request: NextRequest) {
  const user = await tillRequestUser(request, { changes: false });
  if (user instanceof NextResponse) return user;

  const shift = request.nextUrl.searchParams.get("shift");
  const receipt = request.nextUrl.searchParams.get("receipt");
  try {
    if (shift !== null) {
      if (!shiftIdSchema.safeParse(shift).success) return tillError("That is not a shift of this till.", 400);
      return tillJson(await shiftHistory(shift, user));
    }
    if (receipt !== null) {
      if (!parseReceiptNumber(receipt)) return tillError("That is not a receipt number.", 400);
      return tillJson({ sale: await saleRecord({ receiptNumber: receipt }) });
    }
    return tillError("Ask for a shift or a receipt number.", 400);
  } catch (error) {
    if (error instanceof PosRejected) return tillError(error.message, 403);
    console.error("[api/pos/history]", error);
    return tillError("The sales could not be loaded. Try again.", 500);
  }
}
