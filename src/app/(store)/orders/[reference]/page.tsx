import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { OrderDetail } from "@/components/store/order-detail";
import { PageHeader } from "@/components/store/page-header";
import { getAccessibleOrder, wasConfirmationEmailed } from "@/server/orders/access";
import { getCurrentUser } from "@/server/session";

export const metadata: Metadata = { title: "Your order", robots: { index: false, follow: false } };

/** Order page for guests (access via private token) — signed-in owners use /account/orders. */
export default async function GuestOrderPage({ params, searchParams }: PageProps<"/orders/[reference]">) {
  const { reference } = await params;
  const query = await searchParams;
  const token = typeof query.token === "string" ? query.token : undefined;
  const order = await getAccessibleOrder(reference, token);

  if (order?.userId) redirect(`/account/orders/${order.reference}${query.placed ? "?placed=1" : ""}`);

  if (!order) {
    const user = await getCurrentUser();
    return (
      <>
        <PageHeader title="Order not available" crumbs={[{ href: "/", label: "Home" }, { label: "Order" }]} />
        <div className="container-page max-w-xl space-y-4">
          <Alert tone="info" title="We can't show this order here">
            For your privacy, orders can only be viewed by the person who placed them. Use the link in your confirmation email,
            {user ? " check your account," : " sign in,"} or track your order with its reference and your email or phone number.
          </Alert>
          <div className="flex flex-wrap gap-2">
            <Link href={`/track-order?reference=${encodeURIComponent(reference)}`} className={buttonVariants()}>
              Track this order
            </Link>
            {!user ? (
              <Link href="/login" className={buttonVariants({ variant: "outline" })}>
                Sign in
              </Link>
            ) : null}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title={`Order ${order.reference}`} crumbs={[{ href: "/", label: "Home" }, { label: `Order ${order.reference}` }]} />
      <div className="container-page">
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
