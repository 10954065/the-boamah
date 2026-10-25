import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { PaymentProviderError, type InitializeInput, type InitializeResult, type PaymentProviderClient, type Verification, type VerifiedStatus } from "./provider";

const API_BASE = "https://api.paystack.co";
const TIMEOUT_MS = 15_000;

function secretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new PaymentProviderError("Paystack is not configured.");
  return key;
}

interface PaystackEnvelope<T> {
  status: boolean;
  message: string;
  data: T;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${secretKey()}`, "Content-Type": "application/json", ...init.headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    throw new PaymentProviderError(`Could not reach Paystack: ${error instanceof Error ? error.message : "network error"}`);
  }
  const body = (await response.json().catch(() => null)) as PaystackEnvelope<T> | null;
  if (!response.ok || !body?.status) {
    throw new PaymentProviderError(`Paystack ${response.status}: ${body?.message ?? "request failed"}`);
  }
  return body.data;
}

function mapStatus(status: string): VerifiedStatus {
  switch (status) {
    case "success":
      return "success";
    case "failed":
    case "reversed":
      return "failed";
    case "abandoned":
      return "abandoned";
    default:
      return "pending";
  }
}

export const paystackClient: PaymentProviderClient = {
  name: "PAYSTACK",

  async initialize(input: InitializeInput): Promise<InitializeResult> {
    const data = await call<{ authorization_url: string; reference: string }>("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email: input.email,
        amount: input.amountMinor, // pesewas
        currency: input.currency,
        reference: input.reference,
        callback_url: input.callbackUrl,
        metadata: input.metadata,
      }),
    });
    if (data.reference !== input.reference) {
      throw new PaymentProviderError("Paystack returned an unexpected reference.");
    }
    return { authorizationUrl: data.authorization_url };
  },

  async verify(reference: string): Promise<Verification> {
    const data = await call<{
      status: string;
      amount: number;
      currency: string;
      id: number;
      channel: string | null;
      gateway_response: string | null;
      paid_at: string | null;
      reference: string;
    }>(`/transaction/verify/${encodeURIComponent(reference)}`);
    if (data.reference !== reference) throw new PaymentProviderError("Verification reference mismatch.");
    return {
      status: mapStatus(data.status),
      amountMinor: data.amount,
      currency: data.currency,
      providerTransactionId: String(data.id),
      channel: data.channel,
      gatewayResponse: data.gateway_response,
      paidAt: data.paid_at ? new Date(data.paid_at) : null,
    };
  },
};

/**
 * Validates the x-paystack-signature header: HMAC-SHA512 of the raw request
 * body keyed with the secret key, compared in constant time.
 */
export function isValidPaystackSignature(rawBody: string, signature: string | null, key = process.env.PAYSTACK_SECRET_KEY): boolean {
  if (!signature || !key) return false;
  const expected = createHmac("sha512", key).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
