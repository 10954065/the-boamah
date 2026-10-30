import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { BuyAgainButton } from "@/components/store/buy-again-button";
import { OrderDetail } from "@/components/store/order-detail";
import { PageHeader } from "@/components/store/page-header";
import { getAccessibleOrder, wasConfirmationEmailed } from "@/server/orders/access";

export const metadata: Metadata = { title: "Your order", robots: { index: false, follow: false } };

/** Order page, open to whoever holds the order's private token (its link, or this browser's cookie). */
export default async function OrderPage({ params, searchParams }: PageProps<"/orders/[reference]">) {
  const { reference } = await params;
  const query = await searchParams;
  const token = typeof query.token === "string" ? query.token : undefined;
  const order = await getAccessibleOrder(reference, token);

  if (!order) {
    return (
      <>
        <PageHeader title="Order not available" crumbs={[{ href: "/", label: "Home" }, { label: "Order" }]} />
        <div className="container-page max-w-xl space-y-4">
          <Alert tone="info" title="We can't show this order here">
            For your privacy, orders can only be viewed by the person who placed them. Use the link in your confirmation email,
            or track your order with its reference and your email or phone number.
          </Alert>
          <Link href={`/track-order?reference=${encodeURIComponent(reference)}`} className={buttonVariants()}>
            Track this order
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title={`Order ${order.reference}`} crumbs={[{ href: "/", label: "Home" }, { label: `Order ${order.reference}` }]} />
      <div className="container-page space-y-4">
        <div className="flex justify-end">
          <BuyAgainButton reference={order.reference} token={token} />
        </div>
        <OrderDetail
          order={order}
          placed={query.placed === "1"}
          paymentNotice={typeof query.payment === "string" ? query.payment : undefined}
          guestToken={token}
          confirmationEmailed={await wasConfirmationEmailed(order.id)}
        />
      </div>
    </>
  );
}
