import "server-only";
import type { StorageAdapter } from "@/ports/storage";
import type { Mailer } from "@/ports/mailer";
import type { InboundEmailProvider } from "@/ports/inbound-email";
import { LocalStorage } from "./local/storage";
import { LogMailer } from "./local/log-mailer";
import { OutboxMailer } from "./local/mailer";
import { GenericInboundProvider } from "./local/inbound-email";
import { DatabaseStorage } from "./database-storage";

type Registry = {
  storage?: StorageAdapter;
  mailer?: Mailer & { list?: OutboxMailer["list"] };
  inbound?: InboundEmailProvider;
};
const g = globalThis as unknown as { __stayieldAdapters?: Registry };
const reg = (): Registry => (g.__stayieldAdapters ??= {});

export function getStorage(): StorageAdapter {
  const r = reg();
  if (!r.storage) {
    const kind = process.env.STORAGE_ADAPTER ?? "local";
    if (kind === "database") r.storage = new DatabaseStorage();
    else if (kind === "local") r.storage = new LocalStorage(process.env.STORAGE_DIR);
    else throw new Error(`Storage adapter "${kind}" is not implemented yet`);
  }
  return r.storage;
}

/** The local outbox mailer; a production mailer plugs in here (see docs/ARCHITECTURE.md). */
export function getMailer(): Mailer & { list?: OutboxMailer["list"] } {
  return (reg().mailer ??= process.env.MAILER === "log" ? new LogMailer() : new OutboxMailer(process.env.OUTBOX_DIR));
}

export function getInboundProvider(): InboundEmailProvider {
  return (reg().inbound ??= new GenericInboundProvider());
}

export { betterAuthAdapter as auth } from "./auth";
