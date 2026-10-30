import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp, { type Metadata, type Sharp } from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UPLOAD_SIZES } from "@/lib/upload-sizes";
import { storeImage, UploadError, type UploadFolder } from "@/server/storage";

const RED = { r: 176, g: 48, b: 32 };

function photo(width: number, height: number): Sharp {
  return sharp({ create: { width, height, channels: 3, background: RED } });
}

async function pixel(file: Buffer, left: number, top: number): Promise<number[]> {
  const raw = await sharp(file).extract({ left, top, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
  return [...raw];
}

const isWhite = (rgb: number[]) => rgb.every((value) => value > 245);
const isPhoto = (rgb: number[]) => rgb[0]! > 150 && rgb[1]! < 90;

describe("uploaded images", () => {
  let dir = "";

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "boamah-uploads-"));
    vi.stubEnv("UPLOAD_DIR", dir);
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(dir, { recursive: true, force: true });
  });

  async function stored(bytes: Buffer, folder: UploadFolder): Promise<{ url: string; file: Buffer; meta: Metadata }> {
    const url = await storeImage(new File([new Uint8Array(bytes)], "photo"), folder);
    const file = await readFile(path.join(dir, url.replace("/uploads/", "")));
    return { url, file, meta: await sharp(file).metadata() };
  }

  it.each([
    ["wide", 1600, 500],
    ["tall", 500, 1600],
    ["square", 700, 700],
    ["tiny", 120, 90],
  ])("a %s product photo comes out the one standard size", async (_shape, width, height) => {
    const { url, meta } = await stored(await photo(width, height).jpeg().toBuffer(), "products");
    expect({ width: meta.width, height: meta.height, format: meta.format }).toEqual({ width: 1000, height: 1000, format: "webp" });
    expect(url).toMatch(/^\/uploads\/products\/\d{10,}-[0-9a-f]{16}\.webp$/);
  });

  it("keeps the whole product in view on white instead of cropping it", async () => {
    const { file } = await stored(await photo(1000, 500).png().toBuffer(), "products");
    expect(isWhite(await pixel(file, 500, 20))).toBe(true);
    expect(isPhoto(await pixel(file, 20, 500))).toBe(true);
    expect(isPhoto(await pixel(file, 980, 500))).toBe(true);
  });

  it("puts transparent product photos on white", async () => {
    const clear = await sharp({ create: { width: 300, height: 300, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    const { file } = await stored(clear, "products");
    expect(isWhite(await pixel(file, 500, 500))).toBe(true);
  });

  it("gives category and banner pictures their own one size", async () => {
    for (const folder of ["categories", "banners"] as const) {
      const { meta } = await stored(await photo(800, 2000).png().toBuffer(), folder);
      expect({ width: meta.width, height: meta.height }).toEqual({ width: UPLOAD_SIZES[folder].width, height: UPLOAD_SIZES[folder].height });
    }
  });

  it("stands a sideways phone photo upright and drops what the camera recorded", async () => {
    const sideways = await photo(1000, 500).withExif({ IFD0: { Copyright: "Camera details" } }).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const { file, meta } = await stored(sideways, "products");
    // Upright, the 2:1 photo is tall, so the white is at the sides.
    expect(isWhite(await pixel(file, 20, 500))).toBe(true);
    expect(isPhoto(await pixel(file, 500, 20))).toBe(true);
    expect(meta.exif).toBeUndefined();
  });

  it("refuses a file that only starts like an image", async () => {
    const fake = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 7)]);
    await expect(storeImage(new File([new Uint8Array(fake)], "photo.png"), "products")).rejects.toThrow(UploadError);
  });
});
