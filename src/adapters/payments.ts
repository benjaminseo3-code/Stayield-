import { createHmac, timingSafeEqual } from "node:crypto";
import type { CheckoutInput, CheckoutSession, PaymentEvent, PaymentProvider } from "@/ports/payment";

/** Dev provider: redirects to an in-app page that "pays" with one click. */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock" as const;

  async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    const base = process.env.APP_URL ?? "http://localhost:3000";
    return {
      providerRef: `mock_${input.paymentId}`,
      redirectUrl: `${base}/checkout/mock?payment=${encodeURIComponent(input.paymentId)}`,
    };
  }
}

/** Stripe Checkout (test mode when using sk_test_ keys). Uses the REST API directly. */
export class StripePaymentProvider implements PaymentProvider {
  readonly name = "stripe" as const;

  constructor(
    private readonly secretKey: string,
    private readonly webhookSecret: string | undefined,
  ) {}

  async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    const body = new URLSearchParams({
      mode: "payment",
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      customer_email: input.buyerEmail,
      client_reference_id: input.paymentId,
      "metadata[paymentId]": input.paymentId,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": input.currency.toLowerCase(),
      "line_items[0][price_data][unit_amount]": String(input.amountMinor),
      "line_items[0][price_data][product_data][name]": input.propertyLabel,
    });
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.secretKey}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    });
    if (!res.ok) throw new Error(`Stripe checkout failed (${res.status})`);
    const json = (await res.json()) as { id: string; url: string };
    return { providerRef: json.id, redirectUrl: json.url };
  }

  async parseWebhook(req: Request): Promise<PaymentEvent | null> {
    if (!this.webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET not set");
    const payload = await req.text();
    const event = verifyStripeSignature(payload, req.headers.get("stripe-signature"), this.webhookSecret);
    const obj = event.data?.object as
      | { id?: string; metadata?: { paymentId?: string } }
      | undefined;
    const paymentId = obj?.metadata?.paymentId;
    if (!obj?.id || !paymentId) return null;
    if (event.type === "checkout.session.completed")
      return { providerRef: obj.id, paymentId, status: "succeeded" };
    if (event.type === "checkout.session.expired")
      return { providerRef: obj.id, paymentId, status: "failed" };
    return null;
  }
}

type StripeEvent = { type: string; data?: { object?: unknown } };

/** Verifies a `Stripe-Signature` header (t=...,v1=...) with a 5 minute tolerance. Throws if invalid. */
export function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  now = Date.now(),
): StripeEvent {
  if (!header) throw new Error("missing signature");
  const parts = Object.fromEntries(
    header.split(",").map((kv) => {
      const i = kv.indexOf("=");
      return [kv.slice(0, i), kv.slice(i + 1)];
    }),
  );
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(now / 1000 - t) > 300) throw new Error("stale signature");
  const expected = createHmac("sha256", secret).update(`${t}.${payload}`).digest();
  const given = Buffer.from(parts.v1 ?? "", "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new Error("bad signature");
  }
  return JSON.parse(payload) as StripeEvent;
}
