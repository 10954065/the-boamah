import "server-only";
import { prisma } from "@/lib/db";
import { siteUrl } from "@/lib/utils";
import { PaymentProviderError, type InitializeInput, type InitializeResult, type PaymentProviderClient, type Verification } from "./provider";

/**
 * Local development / automated-test gateway. It mirrors the real flow
 * (redirect → callback → server-side verification) without moving money.
 * Refuses to run in production.
 */
function assertAllowed(): void {
  if (process.env.NODE_ENV === "production" || process.env.PAYMENTS_MOCK !== "true") {
    throw new PaymentProviderError("The mock payment gateway is disabled.");
  }
}

export const MOCK_SUCCESS = "mock:success";
export const MOCK_FAILED = "mock:failed";

export const mockClient: PaymentProviderClient = {
  name: "MOCK",

  async initialize(input: InitializeInput): Promise<InitializeResult> {
    assertAllowed();
    const params = new URLSearchParams({ reference: input.reference, callback: input.callbackUrl });
    return { authorizationUrl: siteUrl(`/dev/mock-pay?${params.toString()}`) };
  },

  async verify(reference: string): Promise<Verification> {
    assertAllowed();
    const payment = await prisma.payment.findUnique({ where: { reference } });
    if (!payment) throw new PaymentProviderError("Unknown reference.");
    const outcome = payment.gatewayResponse;
    return {
      status: outcome === MOCK_SUCCESS ? "success" : outcome === MOCK_FAILED ? "failed" : "pending",
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      providerTransactionId: outcome === MOCK_SUCCESS ? `mock_${payment.id}` : null,
      channel: outcome === MOCK_SUCCESS ? "mock" : null,
      gatewayResponse: outcome,
      paidAt: outcome === MOCK_SUCCESS ? new Date() : null,
    };
  },
};
