import "server-only";
import type { StorageAdapter } from "@/ports/storage";
import type { Mailer } from "@/ports/mailer";
import type { InboundEmailProvider } from "@/ports/inbound-email";
import type { PaymentProvider } from "@/ports/payment";
import { LocalStorage } from "./local/storage";
import { OutboxMailer } from "./local/mailer";
import { GenericInboundProvider } from "./local/inbound-email";
import { MockPaymentProvider, StripePaymentProvider } from "./payments";

type Registry = {
  storage?: StorageAdapter;
  mailer?: Mailer & { list?: OutboxMailer["list"] };
  inbound?: InboundEmailProvider;
  payment?: PaymentProvider;
};
const g = globalThis as unknown as { __stayieldAdapters?: Registry };
const reg = (): Registry => (g.__stayieldAdapters ??= {});

export function getStorage(): StorageAdapter {
  const r = reg();
  if (!r.storage) {
    const kind = process.env.STORAGE_ADAPTER ?? "local";
    if (kind !== "local") throw new Error(`Storage adapter "${kind}" is not implemented yet`);
    r.storage = new LocalStorage(process.env.STORAGE_DIR);
  }
  return r.storage;
}

/** The local outbox mailer; a production mailer plugs in here (see docs/ARCHITECTURE.md). */
export function getMailer(): Mailer & { list?: OutboxMailer["list"] } {
  return (reg().mailer ??= new OutboxMailer(process.env.OUTBOX_DIR));
}

export function getInboundProvider(): InboundEmailProvider {
  return (reg().inbound ??= new GenericInboundProvider());
}

export function getPaymentProvider(): PaymentProvider {
  const r = reg();
  if (!r.payment) {
    if (process.env.PAYMENT_PROVIDER === "stripe") {
      const key = process.env.STRIPE_SECRET_KEY;
      if (!key) throw new Error("PAYMENT_PROVIDER=stripe requires STRIPE_SECRET_KEY");
      r.payment = new StripePaymentProvider(key, process.env.STRIPE_WEBHOOK_SECRET);
    } else {
      // The mock "pays" with one click, so it must never run in production by accident.
      if (process.env.NODE_ENV === "production" && process.env.ALLOW_MOCK_PAYMENTS !== "true") {
        throw new Error("PAYMENT_PROVIDER=mock is not allowed in production (set PAYMENT_PROVIDER=stripe)");
      }
      r.payment = new MockPaymentProvider();
    }
  }
  return r.payment;
}

export { betterAuthAdapter as auth } from "./auth";
