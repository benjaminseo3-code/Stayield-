import "server-only";
import { eq, like, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import { storageObjects } from "@/db/schema";
import type { StorageAdapter } from "@/ports/storage";

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Stores files as rows in Postgres (`storage_objects`). Works on serverless hosts with no writable
 * disk and keeps files in the same place as the data. Fine for photos at demo/early-stage scale;
 * move to S3 / Supabase Storage behind the same interface when volumes grow.
 */
export class DatabaseStorage implements StorageAdapter {
  async put(key: string, data: Buffer, opts?: { contentType?: string }): Promise<void> {
    const db = await getDb();
    const contentType = opts?.contentType ?? contentTypeFor(key);
    await db
      .insert(storageObjects)
      .values({ key, data, contentType })
      .onConflictDoUpdate({ target: storageObjects.key, set: { data, contentType } });
  }

  async get(key: string): Promise<Buffer | null> {
    const [row] = await (await getDb()).select({ data: storageObjects.data }).from(storageObjects).where(eq(storageObjects.key, key)).limit(1);
    return row?.data ?? null;
  }

  async exists(key: string): Promise<boolean> {
    const [row] = await (await getDb()).select({ key: storageObjects.key }).from(storageObjects).where(eq(storageObjects.key, key)).limit(1);
    return !!row;
  }

  async delete(key: string): Promise<void> {
    await (await getDb()).delete(storageObjects).where(eq(storageObjects.key, key));
  }

  async deletePrefix(prefix: string): Promise<void> {
    const db = await getDb();
    await db.delete(storageObjects).where(or(eq(storageObjects.key, prefix), like(storageObjects.key, `${escapeLike(prefix)}/%`)));
  }
}

function contentTypeFor(key: string): string {
  if (key.endsWith(".webp")) return "image/webp";
  if (key.endsWith(".jpg") || key.endsWith(".jpeg")) return "image/jpeg";
  if (key.endsWith(".json")) return "application/json";
  return "application/octet-stream";
}
