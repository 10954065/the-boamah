import { NextResponse, type NextRequest } from "next/server";
import { posShiftCloseSchema } from "@/lib/pos";
import { tillBody, tillError, tillJson, tillRequestUser } from "@/server/pos/request";
import { closePosShift } from "@/server/pos/shifts";

/** Closes a shift with the amounts counted, and returns what it should have taken. */
export async function POST(request: NextRequest) {
  const user = await tillRequestUser(request, { changes: true });
  if (user instanceof NextResponse) return user;

  const input = await tillBody(request, posShiftCloseSchema);
  if (!input) return tillError("The shift count is not in the expected format.", 400);

  try {
    return tillJson(await closePosShift(input, user));
  } catch (error) {
    console.error("[api/pos/shifts/close]", error);
    return tillError("The shift could not be closed. Try again.", 500);
  }
}
