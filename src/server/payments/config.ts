import "server-only";
import type { StoreSettings } from "@/generated/prisma/client";

export type ActiveProvider = "PAYSTACK" | "MOCK" | null;

/**
 * Which online payment provider is usable in this environment.
 * - PAYSTACK when PAYSTACK_SECRET_KEY is set.
 * - MOCK only outside production and only when PAYMENTS_MOCK=true
 *   (local development / automated tests). Never in production.
 */
export function activeOnlineProvider(): ActiveProvider {
  if (process.env.PAYSTACK_SECRET_KEY) return "PAYSTACK";
  if (process.env.NODE_ENV !== "production" && process.env.PAYMENTS_MOCK === "true") return "MOCK";
  return null;
}

export function isOnlinePaymentAvailable(settings: Pick<StoreSettings, "onlinePaymentEnabled">): boolean {
  return settings.onlinePaymentEnabled && activeOnlineProvider() !== null;
}

export function isPaystackTestMode(): boolean {
  return (process.env.PAYSTACK_SECRET_KEY ?? "").startsWith("sk_test_");
}
