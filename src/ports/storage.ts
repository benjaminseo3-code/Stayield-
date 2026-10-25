/** Blob storage port. Local disk in dev; S3 / Supabase Storage later. */
export interface StorageAdapter {
  put(key: string, data: Buffer, opts?: { contentType?: string }): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  /** Delete every object whose key starts with `prefix`. */
  deletePrefix(prefix: string): Promise<void>;
}
