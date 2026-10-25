import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Mailer, OutgoingMail } from "@/ports/mailer";

export type OutboxEntry = OutgoingMail & { id: string; sentAt: string };

/** Dev mailer: writes each message to ./.data/outbox instead of sending it. */
export class OutboxMailer implements Mailer {
  constructor(private readonly dir = path.join(process.cwd(), ".data", "outbox")) {}

  async send(mail: OutgoingMail): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    const id = randomUUID();
    const entry: OutboxEntry = { ...mail, id, sentAt: new Date().toISOString() };
    await fs.writeFile(
      path.join(this.dir, `${Date.now()}-${id}.json`),
      JSON.stringify(entry, null, 2),
    );
  }

  async list(): Promise<OutboxEntry[]> {
    let names: string[];
    try {
      names = await fs.readdir(this.dir);
    } catch {
      return [];
    }
    const entries = await Promise.all(
      names
        .filter((n) => n.endsWith(".json"))
        .sort()
        .reverse()
        .slice(0, 50)
        .map(async (n) => JSON.parse(await fs.readFile(path.join(this.dir, n), "utf8")) as OutboxEntry),
    );
    return entries;
  }
}
