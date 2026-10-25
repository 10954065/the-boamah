import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { safeRedirectPath } from "@/lib/utils";
import { MOCK_FAILED, MOCK_SUCCESS } from "@/server/payments/mock";

export const metadata: Metadata = { title: "Test payment", robots: { index: false, follow: false } };

function mockEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.PAYMENTS_MOCK === "true";
}

/**
 * Development-only stand-in for the Paystack checkout page. Records the
 * chosen outcome on the payment attempt, then returns to the normal callback,
 * which verifies it server-side exactly as it would a real payment.
 */
export default async function MockPayPage({ searchParams }: PageProps<"/dev/mock-pay">) {
  if (!mockEnabled()) notFound();
  const params = await searchParams;
  const reference = typeof params.reference === "string" ? params.reference : "";
  const payment = await prisma.payment.findUnique({ where: { reference }, include: { order: { select: { reference: true } } } });
  if (!payment || payment.provider !== "MOCK") notFound();

  async function complete(formData: FormData) {
    "use server";
    if (!mockEnabled()) notFound();
    const outcome = formData.get("outcome") === "success" ? MOCK_SUCCESS : MOCK_FAILED;
    await prisma.payment.updateMany({ where: { reference, provider: "MOCK", status: "INITIALIZED" }, data: { gatewayResponse: outcome } });
    redirect(safeRedirectPath(`/checkout/callback?reference=${encodeURIComponent(reference)}`));
  }

  return (
    <div className="container-page max-w-lg py-12">
      <div className="space-y-5 rounded-lg border-2 border-dashed border-gold-400 bg-surface p-6">
        <Alert tone="warning" title="Development test gateway">
          This page only exists in local development. No real payment is made.
        </Alert>
        <div>
          <p className="text-sm text-ink-muted">Order {payment.order.reference}</p>
          <p className="text-2xl font-extrabold">{formatMoney(payment.amountMinor)}</p>
        </div>
        <form action={complete} className="flex flex-wrap gap-3">
          <Button type="submit" name="outcome" value="success">
            Simulate successful payment
          </Button>
          <Button type="submit" name="outcome" value="failed" variant="outline">
            Simulate failed payment
          </Button>
        </form>
      </div>
    </div>
  );
}
