import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ORDER_STATUSES } from "@/lib/order-status";
import { OrderActionError } from "@/server/orders/lifecycle";
import { moveTillOrder, tillOrders } from "@/server/pos/orders";
import { tillBody, tillError, tillJson, tillRequestUser } from "@/server/pos/request";

const moveSchema = z.object({ orderId: z.string().min(1).max(64), to: z.enum(ORDER_STATUSES) });

/** Website orders waiting at the till. */
export async function GET(request: NextRequest) {
  const user = await tillRequestUser(request, { changes: false });
  if (user instanceof NextResponse) return user;
  try {
    return tillJson({ orders: await tillOrders() });
  } catch (error) {
    console.error("[api/pos/orders]", error);
    return tillError("The website orders could not be loaded. Try again.", 500);
  }
}

/** Moves one order to its next packing step and answers with the list as it now stands. */
export async function POST(request: NextRequest) {
  const user = await tillRequestUser(request, { changes: true });
  if (user instanceof NextResponse) return user;
  const body = await tillBody(request, moveSchema);
  if (!body) return tillError("That is not a website order.", 400);
  try {
    await moveTillOrder(body, user);
    return tillJson({ orders: await tillOrders() });
  } catch (error) {
    if (error instanceof OrderActionError) return tillError(error.message, 409);
    console.error("[api/pos/orders]", error);
    return tillError("The order could not be updated. Try again.", 500);
  }
}
