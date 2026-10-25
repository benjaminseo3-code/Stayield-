export type CheckoutInput = {
  paymentId: string;
  buyerEmail: string;
  propertyId: string;
  propertyLabel: string;
  amountMinor: number;
  currency: string;
  successUrl: string;
  cancelUrl: string;
};

export type CheckoutSession = {
  providerRef: string;
  /** Where to send the buyer to pay. */
  redirectUrl: string;
};

export type PaymentEvent = { providerRef: string; paymentId: string; status: "succeeded" | "failed" };

export interface PaymentProvider {
  readonly name: "mock" | "stripe";
  createCheckout(input: CheckoutInput): Promise<CheckoutSession>;
  /** Verify and decode a provider webhook. Throws on an invalid signature (fail closed). */
  parseWebhook?(req: Request): Promise<PaymentEvent | null>;
}
