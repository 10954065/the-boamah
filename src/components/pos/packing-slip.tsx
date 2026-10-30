import { paymentNote, type TillOrder } from "@/lib/pos-orders";
import { formatQuantity } from "@/lib/quantity";
import { formatDateTime } from "@/lib/utils";
import { Paper } from "./receipt";
import type { TillPrefs } from "./till-storage";

/** Goes in or on the bag: marks the goods as a website order, and whose, with a box to tick for each item. */
export function PackingSlip({ order, paper }: { order: TillOrder; paper: TillPrefs["paper"] }) {
  const pickup = order.fulfilmentMethod === "PICKUP";
  const place = [order.addressLine, order.addressDetails, order.area, order.city].filter(Boolean).join(", ");
  return (
    <Paper paper={paper}>
      <p className="text-center text-[1.4em] font-bold leading-tight">WEBSITE ORDER</p>
      <p className="text-center font-bold">{order.reference}</p>
      <p className="text-center">Placed {formatDateTime(order.placedAt)}</p>
      <div className="my-2 border-y border-dashed border-black py-1">
        <p className="font-bold">{order.customerName}</p>
        <p>{order.phone}</p>
        <p>{pickup ? "Pickup at the shop" : `Deliver to: ${place}`}</p>
        {order.deliveryInstructions ? <p>Note: {order.deliveryInstructions}</p> : null}
      </div>
      <ul>
        {order.lines.map((line) => (
          <li key={line.id} className="flex gap-1.5 py-0.5">
            <span aria-hidden="true">[ ]</span>
            <span className="min-w-0 flex-1">
              {line.productName} ({line.variantName})
            </span>
            <span className="shrink-0 font-bold">{formatQuantity(line.quantityMilli, line.unit)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 border-t border-dashed border-black pt-1 font-bold">{paymentNote(order)}</p>
    </Paper>
  );
}
