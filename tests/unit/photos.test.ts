import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { MAX_DIMENSION, MAX_PHOTO_BYTES, processPhoto, sniffImage } from "@/lib/photos";

const jpegWithGps = async (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: "#336699" } })
    .jpeg()
    .withExif({ IFD0: { Copyright: "secret-copyright" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "32/1 4/1 0/1" } })
    .toBuffer();

describe("photo pipeline", () => {
  it("sniffs the real format from magic bytes, not the name", async () => {
    expect(sniffImage(await jpegWithGps(10, 10))).toBe("jpeg");
    expect(sniffImage(await sharp({ create: { width: 4, height: 4, channels: 3, background: "#fff" } }).png().toBuffer())).toBe("png");
    expect(sniffImage(Buffer.from("<?php echo 1; ?>"))).toBeNull();
    expect(sniffImage(Buffer.from("GIF89a....."))).toBeNull();
  });

  it("strips EXIF/GPS, downsizes to 2400px and produces webp + jpeg + thumbnail", async () => {
    const input = await jpegWithGps(3200, 2000);
    expect((await sharp(input).metadata()).exif).toBeDefined(); // sanity: the input really has EXIF
    const res = await processPhoto(input);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.photo.width).toBe(MAX_DIMENSION);
    expect(res.photo.height).toBe(1500);
    for (const buf of [res.photo.full.webp, res.photo.full.jpg, res.photo.thumb]) {
      const meta = await sharp(buf).metadata();
      expect(meta.exif).toBeUndefined();
      expect(buf.toString("latin1")).not.toContain("secret-copyright");
    }
    expect((await sharp(res.photo.thumb).metadata()).width).toBe(640);
  });

  it("does not enlarge small images", async () => {
    const res = await processPhoto(await jpegWithGps(800, 600));
    expect(res.ok && res.photo.width).toBe(800);
  });

  it("rejects non-images, oversized files and corrupt files", async () => {
    expect(await processPhoto(Buffer.from("hello world"))).toEqual({ ok: false, error: "not_an_image" });
    expect(await processPhoto(Buffer.alloc(MAX_PHOTO_BYTES + 1))).toEqual({ ok: false, error: "too_large" });
    const corrupt = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);
    expect(await processPhoto(corrupt)).toEqual({ ok: false, error: "corrupt" });
  });
});
