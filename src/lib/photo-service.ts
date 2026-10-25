import { and, asc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Db } from "@/db/client";
import { propertyPhotos } from "@/db/schema";
import type { StorageAdapter } from "@/ports/storage";
import { MAX_PHOTOS, photoKey, processPhoto, storePhoto, type PhotoError } from "@/lib/photos";

export type AddPhotoResult = { ok: true; id: string } | { ok: false; error: PhotoError | "limit_reached" };

/** Adds one processed photo. The first photo becomes the cover. */
export async function addPhoto(db: Db, storage: StorageAdapter, propertyId: string, bytes: Buffer, opts: { id?: string } = {}): Promise<AddPhotoResult> {
  const existing = await db.select({ id: propertyPhotos.id }).from(propertyPhotos).where(eq(propertyPhotos.propertyId, propertyId));
  if (existing.length >= MAX_PHOTOS) return { ok: false, error: "limit_reached" };

  const processed = await processPhoto(bytes);
  if (!processed.ok) return processed;

  const id = opts.id ?? randomUUID();
  const key = photoKey(propertyId, id);
  await storePhoto(storage, key, processed.photo);
  await db.insert(propertyPhotos).values({
    id,
    propertyId,
    storageKey: key,
    position: existing.length,
    isCover: existing.length === 0,
    width: processed.photo.width,
    height: processed.photo.height,
  });
  return { ok: true, id };
}

async function listIds(db: Db, propertyId: string): Promise<string[]> {
  const rows = await db.select({ id: propertyPhotos.id }).from(propertyPhotos).where(eq(propertyPhotos.propertyId, propertyId)).orderBy(asc(propertyPhotos.position));
  return rows.map((r) => r.id);
}

/** Applies a new order. `ids` must be exactly the property's photos, otherwise nothing changes. */
export async function reorderPhotos(db: Db, propertyId: string, ids: string[]): Promise<boolean> {
  const current = await listIds(db, propertyId);
  if (ids.length !== current.length || new Set(ids).size !== ids.length || !ids.every((id) => current.includes(id))) return false;
  await db.transaction(async (tx) => {
    for (const [position, id] of ids.entries()) {
      await tx.update(propertyPhotos).set({ position }).where(and(eq(propertyPhotos.id, id), eq(propertyPhotos.propertyId, propertyId)));
    }
  });
  return true;
}

export async function setCover(db: Db, propertyId: string, photoId: string): Promise<boolean> {
  if (!(await listIds(db, propertyId)).includes(photoId)) return false;
  await db.transaction(async (tx) => {
    await tx.update(propertyPhotos).set({ isCover: false }).where(eq(propertyPhotos.propertyId, propertyId));
    await tx.update(propertyPhotos).set({ isCover: true }).where(eq(propertyPhotos.id, photoId));
  });
  return true;
}

export async function setAlt(db: Db, propertyId: string, photoId: string, alt: string): Promise<boolean> {
  const res = await db
    .update(propertyPhotos)
    .set({ alt: alt.slice(0, 200) })
    .where(and(eq(propertyPhotos.id, photoId), eq(propertyPhotos.propertyId, propertyId)))
    .returning({ id: propertyPhotos.id });
  return res.length > 0;
}

/** Deletes a photo (files + row) and keeps a cover and contiguous positions. */
export async function deletePhoto(db: Db, storage: StorageAdapter, propertyId: string, photoId: string): Promise<boolean> {
  const [photo] = await db
    .select()
    .from(propertyPhotos)
    .where(and(eq(propertyPhotos.id, photoId), eq(propertyPhotos.propertyId, propertyId)))
    .limit(1);
  if (!photo) return false;
  await storage.deletePrefix(photo.storageKey);
  await db.delete(propertyPhotos).where(eq(propertyPhotos.id, photoId));
  const rest = await listIds(db, propertyId);
  await reorderPhotos(db, propertyId, rest);
  if (photo.isCover && rest.length) await setCover(db, propertyId, rest[0]);
  return true;
}

export async function deleteAllPhotos(storage: StorageAdapter, propertyId: string): Promise<void> {
  await storage.deletePrefix(`photos/${propertyId}`);
}
