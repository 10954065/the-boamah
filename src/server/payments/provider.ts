import "server-only";

export interface InitializeInput {
  reference: string;
  amountMinor: number;
  currency: "GHS";
  email: string;
  callbackUrl: string;
  metadata: Record<string, string>;
}

export interface InitializeResult {
  authorizationUrl: string;
}

export type VerifiedStatus = "success" | "failed" | "abandoned" | "pending";

export interface Verification {
  status: VerifiedStatus;
  amountMinor: number;
  currency: string;
  providerTransactionId: string | null;
  channel: string | null;
  gatewayResponse: string | null;
  paidAt: Date | null;
}

/** Integration boundary so another provider can be added later. */
export interface PaymentProviderClient {
  readonly name: "PAYSTACK" | "MOCK";
  initialize(input: InitializeInput): Promise<InitializeResult>;
  verify(reference: string): Promise<Verification>;
}

export class PaymentProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentProviderError";
  }
}
