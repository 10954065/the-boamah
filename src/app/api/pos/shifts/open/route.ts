import { NextResponse, type NextRequest } from "next/server";
import { posShiftOpenSchema } from "@/lib/pos";
import { tillBody, tillError, tillJson, tillRequestUser } from "@/server/pos/request";
import { openPosShift } from "@/server/pos/shifts";

/** Opens the signed-in cashier's shift on a till, with the cash float. */
export async function POST(request: NextRequest) {
  const user = await tillRequestUser(request, { changes: true });
  if (user instanceof NextResponse) return user;

  const input = await tillBody(request, posShiftOpenSchema);
  if (!input) return tillError("The shift details are not in the expected format.", 400);

  try {
    return tillJson(await openPosShift(input, user));
  } catch (error) {
    console.error("[api/pos/shifts/open]", error);
    return tillError("The shift could not be opened. Try again.", 500);
  }
}
