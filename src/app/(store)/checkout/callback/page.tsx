import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { PageHeader } from "@/components/store/page-header";
import { prisma } from "@/lib/db";
import { verifyAndApply } from "@/server/payments/service";

export const metadata: Metadata = { title: "Confirming your payment", robots: { index: false, follow: false } };

/**
 * Landing page after the payment provider redirects back. The query string
 * is NOT trusted as proof of payment: the payment is verified server-to-server
 * before anything is marked as paid.
 */
export default async function PaymentCallbackPage({ searchParams }: PageProps<"/checkout/callback">) {
  const params = await searchParams;
  const reference = typeof params.reference === "string" ? params.reference.slice(0, 64) : "";
  const payment = reference
    ? await prisma.payment.findUnique({ where: { reference }, select: { order: { select: { reference: true, userId: true } } } })
    : null;

  if (!payment) {
    return (
      <>
        <PageHeader title="Payment" crumbs={[{ href: "/", label: "Home" }, { label: "Payment" }]} />
        <div className="container-page max-w-xl">
          <Alert tone="danger" title="We couldn't find this payment">
            If money has left your account, please contact us with your order reference.
          </Alert>
        </div>
      </>
    );
  }

  let outcome = "PENDING";
  try {
    outcome = (await verifyAndApply(reference)).outcome;
  } catch (error) {
    console.error("[checkout/callback] verification failed", { reference, error });
    outcome = "VERIFY_ERROR";
  }

  const base = payment.order.userId ? `/account/orders/${payment.order.reference}` : `/orders/${payment.order.reference}`;
  if (outcome === "PAID" || outcome === "ALREADY_PAID") redirect(`${base}?placed=1`);
  if (outcome === "FAILED") redirect(`${base}?payment=failed`);

  return (
    <>
      <PageHeader title="Confirming your payment" crumbs={[{ href: "/", label: "Home" }, { label: "Payment" }]} />
      <div className="container-page max-w-xl space-y-4">
        <Alert tone="info" title="Your payment is being confirmed">
          We haven&rsquo;t received confirmation from the payment provider yet. This can take a moment for Mobile Money. Your
          order will update automatically once the payment is confirmed. You will not be charged twice.
        </Alert>
        <Link href={base} className={buttonVariants()}>
          View your order
        </Link>
      </div>
    </>
  );
}
