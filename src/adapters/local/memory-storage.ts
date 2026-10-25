import type { StorageAdapter } from "@/ports/storage";

/**
 * Process-memory storage for the public demo deployment (serverless has no writable disk).
 * Files vanish when the instance is recycled; the demo seed recreates its own photos on start.
 */
export class MemoryStorage implements StorageAdapter {
  private readonly files = new Map<string, Buffer>();

  async put(key: string, data: Buffer): Promise<void> {
    this.files.set(key, Buffer.from(data));
  }
  async get(key: string): Promise<Buffer | null> {
    return this.files.get(key) ?? null;
  }
  async exists(key: string): Promise<boolean> {
    return this.files.has(key);
  }
  async delete(key: string): Promise<void> {
    this.files.delete(key);
  }
  async deletePrefix(prefix: string): Promise<void> {
    for (const k of [...this.files.keys()]) if (k === prefix || k.startsWith(`${prefix}/`)) this.files.delete(k);
  }
}
