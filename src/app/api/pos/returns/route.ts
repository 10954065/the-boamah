import { NextResponse, type NextRequest } from "next/server";
import { posReturnSchema } from "@/lib/pos-returns";
import { tillBody, tillError, tillJson, tillRequestUser } from "@/server/pos/request";
import { recordPosReturn } from "@/server/pos/returns";

/**
 * Records goods brought back from an earlier sale and the refund paid out of
 * the shift open on the till, with a manager's approval. Needs the internet;
 * sending the same return again records it once.
 */
export async function POST(request: NextRequest) {
  const user = await tillRequestUser(request, { changes: true });
  if (user instanceof NextResponse) return user;

  const input = await tillBody(request, posReturnSchema);
  if (!input) return tillError("The return is not in the expected format.", 400);

  try {
    return tillJson(await recordPosReturn(input, user));
  } catch (error) {
    console.error("[api/pos/returns]", error);
    return tillError("The return could not be saved. Try again.", 500);
  }
}
