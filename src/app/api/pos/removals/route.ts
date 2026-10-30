import { NextResponse, type NextRequest } from "next/server";
import { posRemovalSchema } from "@/lib/pos-returns";
import { recordRemoval } from "@/server/pos/removals";
import { tillBody, tillError, tillJson, tillRequestUser } from "@/server/pos/request";

/** Records, with a manager's approval, that something the shop's system refused is being removed from a till. */
export async function POST(request: NextRequest) {
  const user = await tillRequestUser(request, { changes: true });
  if (user instanceof NextResponse) return user;

  const input = await tillBody(request, posRemovalSchema);
  if (!input) return tillError("The removal is not in the expected format.", 400);

  try {
    return tillJson(await recordRemoval(input, user));
  } catch (error) {
    console.error("[api/pos/removals]", error);
    return tillError("The removal could not be recorded. Try again.", 500);
  }
}
