import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderDetail } from "@/components/store/order-detail";
import { getAccessibleOrder, wasConfirmationEmailed } from "@/server/orders/access";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Order details", robots: { index: false } };

export default async function AccountOrderPage({ params, searchParams }: PageProps<"/account/orders/[reference]">) {
  const { reference } = await params;
  await requireUser(`/account/orders/${reference}`);
  const query = await searchParams;
  // Ownership is enforced inside getAccessibleOrder: other customers' orders return null.
  const order = await getAccessibleOrder(reference);
  if (!order) notFound();
  return (
    <div className="space-y-5">
      <div>
        <Link href="/account/orders" className="text-sm font-medium text-brand-700 hover:underline">
          ← All orders
        </Link>
        <h1 className="mt-2 text-2xl font-extrabold">Order {order.reference}</h1>
      </div>
      <OrderDetail
        order={order}
        placed={query.placed === "1"}
        paymentNotice={typeof query.payment === "string" ? query.payment : undefined}
        confirmationEmailed={await wasConfirmationEmailed(order.id)}
      />
    </div>
  );
}
