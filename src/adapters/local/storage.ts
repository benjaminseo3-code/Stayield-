import fs from "node:fs/promises";
import path from "node:path";
import type { StorageAdapter } from "@/ports/storage";

export class LocalStorage implements StorageAdapter {
  private readonly root: string;

  constructor(root = path.join(process.cwd(), ".data", "files")) {
    this.root = path.resolve(/*turbopackIgnore: true*/ root);
  }

  /** Resolves a key to a path and refuses anything that escapes the storage root. */
  private resolve(key: string): string {
    if (!key || key.includes("\0")) throw new Error("invalid storage key");
    const full = path.resolve(this.root, key);
    if (full !== this.root && !full.startsWith(this.root + path.sep)) {
      throw new Error("invalid storage key");
    }
    return full;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const file = this.resolve(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, data);
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(this.resolve(key));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.resolve(key), { force: true });
  }

  async deletePrefix(prefix: string): Promise<void> {
    await fs.rm(this.resolve(prefix), { recursive: true, force: true });
  }
}
