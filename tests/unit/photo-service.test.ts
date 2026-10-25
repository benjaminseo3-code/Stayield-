import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import { LocalStorage } from "@/adapters/local/storage";
import type { Db } from "@/db/client";
import * as s from "@/db/schema";
import { addPhoto, deletePhoto, reorderPhotos, setCover } from "@/lib/photo-service";
import { MAX_PHOTOS } from "@/lib/photos";
import { createTestDb, makeUser } from "../helpers/db";

let db: Db;
let close: () => Promise<void>;
let storage: LocalStorage;
let dir: string;
let propertyId: string;
let img: Buffer;

const photos = () => db.select().from(s.propertyPhotos).where(eq(s.propertyPhotos.propertyId, propertyId)).orderBy(asc(s.propertyPhotos.position));

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "stayield-photos-"));
  storage = new LocalStorage(dir);
  await makeUser(db, "seller", "seller");
  [{ id: propertyId }] = await db.insert(s.properties).values({ ownerId: "seller", publicSlug: "photo-test" }).returning({ id: s.properties.id });
  img = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#abc" } }).jpeg().toBuffer();
});
afterAll(async () => close());

describe("photo service", () => {
  it("first photo becomes the cover; files land in storage", async () => {
    const r = await addPhoto(db, storage, propertyId, img);
    expect(r.ok).toBe(true);
    const [p] = await photos();
    expect(p).toMatchObject({ isCover: true, position: 0, width: 400, height: 300 });
    expect(await storage.exists(`${p.storageKey}/full.webp`)).toBe(true);
    expect(await storage.exists(`${p.storageKey}/full.jpg`)).toBe(true);
    expect(await storage.exists(`${p.storageKey}/thumb.webp`)).toBe(true);
  });

  it("rejects non-images and enforces the 30 photo limit", async () => {
    expect(await addPhoto(db, storage, propertyId, Buffer.from("not an image"))).toEqual({ ok: false, error: "not_an_image" });
    for (let i = (await photos()).length; i < MAX_PHOTOS; i++) await addPhoto(db, storage, propertyId, img);
    expect((await photos()).length).toBe(MAX_PHOTOS);
    expect(await addPhoto(db, storage, propertyId, img)).toEqual({ ok: false, error: "limit_reached" });
  });

  it("reorders, changes cover, and keeps a cover + contiguous positions after delete", async () => {
    const ids = (await photos()).map((p) => p.id);
    expect(await reorderPhotos(db, propertyId, [...ids].reverse())).toBe(true);
    expect((await photos())[0].id).toBe(ids[ids.length - 1]);
    // Reordering with a wrong set is refused and changes nothing.
    expect(await reorderPhotos(db, propertyId, ids.slice(1))).toBe(false);

    const second = (await photos())[1].id;
    expect(await setCover(db, propertyId, second)).toBe(true);
    expect((await photos()).filter((p) => p.isCover).map((p) => p.id)).toEqual([second]);

    expect(await deletePhoto(db, storage, propertyId, second)).toBe(true);
    const after = await photos();
    expect(after.map((p) => p.position)).toEqual(after.map((_, i) => i));
    expect(after.filter((p) => p.isCover)).toHaveLength(1);
  });
});
