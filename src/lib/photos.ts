import sharp from "sharp";
import type { StorageAdapter } from "@/ports/storage";

export { MAX_PHOTOS, MAX_PHOTO_BYTES } from "./photos-constants";
import { MAX_PHOTO_BYTES } from "./photos-constants";
export const MAX_DIMENSION = 2400;
export const THUMB_WIDTH = 640;
export const VARIANTS = ["full.webp", "full.jpg", "thumb.webp"] as const;
export type Variant = (typeof VARIANTS)[number];

export type PhotoError = "too_large" | "not_an_image" | "corrupt";

/** Detects the real format from the first bytes. Never trusts the extension or Content-Type. */
export function sniffImage(buf: Buffer): "jpeg" | "png" | "webp" | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

export type ProcessedPhoto = {
  full: { webp: Buffer; jpg: Buffer };
  thumb: Buffer;
  width: number;
  height: number;
};

/**
 * Validates and re-encodes an upload: auto-orients from EXIF, then writes brand-new files with ALL
 * metadata (EXIF, GPS, ICC comments) stripped, resized to at most 2400px, plus a thumbnail.
 */
export async function processPhoto(input: Buffer): Promise<{ ok: true; photo: ProcessedPhoto } | { ok: false; error: PhotoError }> {
  if (input.length > MAX_PHOTO_BYTES) return { ok: false, error: "too_large" };
  if (!sniffImage(input)) return { ok: false, error: "not_an_image" };
  try {
    // Orient first; sharp drops metadata on output unless `withMetadata` is called (we never call it).
    const base = sharp(input, { limitInputPixels: 100_000_000, failOn: "error" }).rotate();
    const resized = base.resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true });
    // allSettled: a corrupt file makes every branch reject; none may be left unhandled.
    const [webp, jpg, thumb] = await Promise.allSettled([
      resized.clone().webp({ quality: 80 }).toBuffer(),
      resized.clone().jpeg({ quality: 82, mozjpeg: true }).toBuffer({ resolveWithObject: true }),
      base.clone().resize({ width: THUMB_WIDTH, withoutEnlargement: true }).webp({ quality: 72 }).toBuffer(),
    ]);
    if (webp.status !== "fulfilled" || jpg.status !== "fulfilled" || thumb.status !== "fulfilled") {
      return { ok: false, error: "corrupt" };
    }
    return {
      ok: true,
      photo: {
        full: { webp: webp.value, jpg: jpg.value.data },
        thumb: thumb.value,
        width: jpg.value.info.width,
        height: jpg.value.info.height,
      },
    };
  } catch {
    return { ok: false, error: "corrupt" };
  }
}

export const photoKey = (propertyId: string, photoId: string) => `photos/${propertyId}/${photoId}`;

export async function storePhoto(storage: StorageAdapter, key: string, p: ProcessedPhoto): Promise<void> {
  await Promise.all([
    storage.put(`${key}/full.webp`, p.full.webp),
    storage.put(`${key}/full.jpg`, p.full.jpg),
    storage.put(`${key}/thumb.webp`, p.thumb),
  ]);
}

export const CONTENT_TYPES: Record<Variant, string> = {
  "full.webp": "image/webp",
  "full.jpg": "image/jpeg",
  "thumb.webp": "image/webp",
};
